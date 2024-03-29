package cmd

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"net/url"
	"time"

	ivms101JSON "github.com/CoolBitX-Technology/sygna-bridge-ivms-utils/golang/src"
	bridgeutil "github.com/CoolBitX-Technology/sygna-bridge-util-go"
	"github.com/golang/protobuf/proto"
	"github.com/golang/protobuf/ptypes"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/jinzhu/copier"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/cobra"
	"github.com/trisacrypto/trisa/pkg/trisa/config"
	"github.com/trisacrypto/trisa/pkg/trisa/handler"
	"github.com/trisacrypto/trisa/pkg/trisa/server"
	"github.com/trisacrypto/trisa/pkg/trisa/trust"
	ivms101 "github.com/trisacrypto/trisa/proto/ivms101"
	bitcoin "github.com/trisacrypto/trisa/proto/trisa/data/bitcoin/v1alpha1"
	sygnaIdentity "github.com/trisacrypto/trisa/proto/trisa/identity/sygna/v1alpha1"
	us "github.com/trisacrypto/trisa/proto/trisa/identity/us/v1alpha1"
	pb "github.com/trisacrypto/trisa/proto/trisa/protocol/v1alpha1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

func NewServerCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "server",
		Short: "Start VASP TRISA server",
		Run:   runServerCmd,
	}

	return cmd
}

func runServerCmd(cmd *cobra.Command, args []string) {

	c, err := config.FromFile(configFile)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	chain, err := ioutil.ReadFile(c.TLS.TrustChainFile)
	if err != nil {
		log.Fatalf("load trust chain: %v", err)
	}
	tp := trust.NewProvider(chain)

	crt, err := tls.LoadX509KeyPair(c.TLS.CertificateFile, c.TLS.PrivateKeyFile)
	if err != nil {
		log.Fatalf("load x509 key pair: %v", err)
	}

	baseTLSCfg := &tls.Config{
		Certificates: []tls.Certificate{crt},
		MinVersion:   tls.VersionTLS12,
		CurvePreferences: []tls.CurveID{
			tls.CurveP521,
			tls.CurveP384,
			tls.CurveP256,
		},
		PreferServerCipherSuites: true,
		CipherSuites: []uint16{
			tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_RSA_WITH_AES_128_GCM_SHA256,
		},
	}

	handler := handler.NewDemoHandler(c.Identity.PrivateKey, c.Directory)
	pServer := server.New(handler, crt, tp.GetCertPool())

	errs := make(chan error, 2)

	go func() {

		r := mux.NewRouter()

		r.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Add("Content-Type", "application/json")
			out, _ := json.Marshal(struct {
				Hello string
			}{
				Hello: "World",
			})
			w.Write(out)
		})

		r.HandleFunc("/connect", func(w http.ResponseWriter, r *http.Request) {
			ctx, _ := context.WithTimeout(context.Background(), 2*time.Second)
			out, _ := json.Marshal(mTLSConnectionTest(
				ctx,
				r.URL.Query(),
				crt,
				tp.GetCertPool(),
			))
			w.Write(out)
		})

		r.HandleFunc("/send", func(w http.ResponseWriter, r *http.Request) {

			var identity proto.Message
			ctx := r.Context()
			switch r.URL.Query().Get("example") {
			case "ivms101_1":
				identity = ivms101Example1()
			case "ivms101_2":
				identity = ivms101Example2()
			case "sygna":
				targetVaspCode := r.URL.Query().Get("targetVaspCode")
				identity = sygnaExample(c, targetVaspCode)
				ctx = context.WithValue(ctx, string("targetVaspCode"), targetVaspCode)
			case "trisa":
				fallthrough
			default:
				identity = trisaExample()
			}

			identity2, _ := ptypes.MarshalAny(identity)
			data, _ := ptypes.MarshalAny(&bitcoin.Data{
				Source: uuid.New().String(),
				// Destination: uuid.New().String(),
				Destination: "1KFHE7w8BhaENAswwryaoccDb6qcT6DbYY",
			})

			tData := &pb.TransactionData{
				Identity: identity2,
				Data:     data,
			}

			if err := pServer.SendRequest(ctx, r.URL.Query().Get("target"), uuid.New().String(), tData); err != nil {
				fmt.Fprintf(w, "error: %v", err)
				return
			}

			fmt.Fprint(w, ".")
		})

		srv := &http.Server{
			Addr:      ":" + c.Server.ListenAddressAdmin,
			Handler:   r,
			TLSConfig: baseTLSCfg,
		}

		log.WithFields(log.Fields{
			"component": "admin",
			"tls":       "listening",
			"port":      c.Server.ListenAddressAdmin,
		}).Info("starting TRISA admin server")

		errs <- srv.ListenAndServeTLS(c.TLS.CertificateFile, c.TLS.PrivateKeyFile)
	}()

	/*go func() {

		r := mux.NewRouter()

		r.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {

			w.Header().Add("Content-Type", "application/json")
			params := r.URL.Query()
			response := &PingResponse{
				Message:  params.Get("msg"),
				ClientCN: r.TLS.PeerCertificates[0].Subject.CommonName,
				ServerCN: r.TLS.ServerName,
			}
			out, _ := json.Marshal(response)
			w.Write(out)
		})

		mTLSCfg := &tls.Config{}
		copier.Copy(&mTLSCfg, &baseTLSCfg)

		mTLSCfg.ClientAuth = tls.RequireAndVerifyClientCert
		mTLSCfg.ClientCAs = tp.GetCertPool()

		srv := &http.Server{
			Addr:      c.Server.ListenAddress,
			Handler:   r,
			TLSConfig: mTLSCfg,
		}

		log.WithFields(log.Fields{
			"component": "service",
			"tls":       "listening",
			"port":      c.Server.ListenAddress,
		}).Info("starting TRISA server")

		errs <- srv.ListenAndServeTLS(c.TLS.CertificateFile, c.TLS.PrivateKeyFile)

	}()*/

	go func() {
		lis, err := net.Listen("tcp", ":"+c.Server.ListenAddress)
		if err != nil {
			errs <- err
		}

		mTLSCfg := &tls.Config{}
		copier.Copy(&mTLSCfg, &baseTLSCfg)

		mTLSCfg.ClientAuth = tls.RequireAndVerifyClientCert
		mTLSCfg.ClientCAs = tp.GetCertPool()

		tc := credentials.NewTLS(mTLSCfg)
		s := grpc.NewServer(grpc.Creds(tc))
		pb.RegisterTrisaPeer2PeerServer(s, pServer)

		log.WithFields(log.Fields{
			"component": "grpc",
			"tls":       "listening",
			"port":      c.Server.ListenAddress,
		}).Info("starting TRISA server")

		errs <- s.Serve(lis)
	}()

	log.Fatalf("terminated %v", <-errs)
}

func trisaExample() *us.Identity {
	return &us.Identity{
		FirstName:     "Jane",
		LastName:      "Crock",
		Ssn:           "001-0434-4983",
		DriverLicense: "FA-387463",
		State:         "CA",
	}
}

func sygnaExample(c *config.Config, targetVaspCode string) *sygnaIdentity.Identity {
	// Originator
	// originator name id
	orgNameID := ivms101JSON.NewNaturalPersonNameId()
	orgNameID.SetPrimaryIdentifier("Wu")
	orgNameID.SetSecondaryIdentifier("Xinli")
	orgNameID.SetNameIdentifierType(string(ivms101JSON.NATURALPERSONNAMETYPECODE_LEGL))

	// another name id for originator
	orgNameIDLocal := ivms101JSON.NewLocalNaturalPersonNameId()
	orgNameIDLocal.SetPrimaryIdentifier("吳")
	orgNameIDLocal.SetSecondaryIdentifier("信利")
	orgNameIDLocal.SetNameIdentifierType(string(ivms101JSON.NATURALPERSONNAMETYPECODE_LEGL))

	// assign two name id to originator name
	orgPersonName := ivms101JSON.NewNaturalPersonName()
	orgPersonName.SetNameIdentifiers([]ivms101JSON.NaturalPersonNameId{*orgNameID})
	orgPersonName.SetLocalNameIdentifiers([]ivms101JSON.LocalNaturalPersonNameId{*orgNameIDLocal})

	// originator national id and data
	orgPersonNationalID := ivms101JSON.NewNationalIdentification()
	orgPersonNationalID.SetNationalIdentifier("446005")
	orgPersonNationalID.SetNationalIdentifierType(string(ivms101JSON.NATIONALIDENTIFIERTYPECODE_RAID))
	orgPersonNationalID.SetRegistrationAuthority("RA000553")

	// assign name, national id, country to originator natural person
	originatingNaturalPerson := ivms101JSON.NewNaturalPerson()
	originatingNaturalPerson.SetName(*orgPersonName)
	originatingNaturalPerson.SetNationalIdentification(*orgPersonNationalID)
	originatingNaturalPerson.SetCountryOfResidence("TZ")

	// assign originator to person object
	originatingPerson := ivms101JSON.NewPerson()
	originatingPerson.SetNaturalPerson(*originatingNaturalPerson)

	// assign originator person and account id to originator
	originator := ivms101JSON.NewOriginator()
	originator.SetOriginatorPersons([]ivms101JSON.Person{*originatingPerson})
	originator.SetAccountNumbers([]string{"1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"})

	// Beneficiary
	// beneficiary 1 name id
	beneNameID := ivms101JSON.NewNaturalPersonNameId()
	beneNameID.SetPrimaryIdentifier("Brenden")
	beneNameID.SetSecondaryIdentifier("Samuels")
	beneNameID.SetNameIdentifierType(string(ivms101JSON.NATURALPERSONNAMETYPECODE_LEGL))

	// assign beneficiary 1 name with id
	benePersonName := ivms101JSON.NewNaturalPersonName()
	benePersonName.SetNameIdentifiers([]ivms101JSON.NaturalPersonNameId{*beneNameID})

	// beneficiary 1 is a natural person
	beneficiaryNaturalPerson := ivms101JSON.NewNaturalPerson()
	beneficiaryNaturalPerson.SetName(*benePersonName)

	// assign beneficiary 1 to person object
	beneficiaryPerson := ivms101JSON.NewPerson()
	beneficiaryPerson.SetNaturalPerson(*beneficiaryNaturalPerson)

	// assign both persons to beneficiary object
	beneficiary := ivms101JSON.NewBeneficiary()
	beneficiary.SetBeneficiaryPersons([]ivms101JSON.Person{*beneficiaryPerson})
	beneficiary.SetAccountNumbers([]string{"1KFHE7w8BhaENAswwryaoccDb6qcT6DbYY"})

	// assign originator and beneficiary data to identity payload
	privateInfo := ivms101JSON.NewIdentityPayload()
	privateInfo.SetOriginator(*originator)
	privateInfo.SetBeneficiary(*beneficiary)

	// encrypt with beneficiary's public key
	privateInfoBytes, _ := privateInfo.MarshalJSON()
	encryptedString, _ := bridgeutil.EncryptString(string(privateInfoBytes), c.Directory[targetVaspCode])
	encryptedBytes, _ := hex.DecodeString(encryptedString)

	return &sygnaIdentity.Identity{
		OriginatorVaspCode:  c.Identity.VaspCode,
		BeneficiaryVaspCode: targetVaspCode,
		EncryptedIdentity:   encryptedBytes,
	}
}

func ivms101Example1() *ivms101.IdentityPayload {
	return &ivms101.IdentityPayload{
		Originator: &ivms101.Originator{
			OriginatorPersons: []*ivms101.Person{
				&ivms101.Person{
					Person: &ivms101.Person_NaturalPerson{
						&ivms101.NaturalPerson{
							Name: &ivms101.NaturalPersonName{
								NameIdentifiers: []*ivms101.NaturalPersonNameId{
									&ivms101.NaturalPersonNameId{
										PrimaryIdentifier:   "Smith",
										SecondaryIdentifier: "Dr Alice",
										NameIdentifierType:  ivms101.NaturalPersonNameTypeCode_NATURAL_PERSON_NAME_TYPE_CODE_LEGL,
									},
								},
							},
							GeographicAddresses: []*ivms101.Address{
								&ivms101.Address{
									AddressType:        ivms101.AddressTypeCode_ADDRESS_TYPE_CODE_GEOG,
									StreetName:         "Potential Street",
									BuildingNumber:     "24",
									BuildingName:       "Weathering Views",
									PostCode:           "91765",
									TownName:           "Walnut",
									CountrySubDivision: "California",
									Country:            "US",
								},
							},
							CustomerIdentification: "1002390",
						},
					},
				},
			},
			AccountNumbers: []string{"10023909"},
		},
		Beneficiary: &ivms101.Beneficiary{
			BeneficiaryPersons: []*ivms101.Person{
				&ivms101.Person{
					Person: &ivms101.Person_NaturalPerson{
						&ivms101.NaturalPerson{
							Name: &ivms101.NaturalPersonName{
								NameIdentifiers: []*ivms101.NaturalPersonNameId{
									&ivms101.NaturalPersonNameId{
										PrimaryIdentifier:   "Barnes",
										SecondaryIdentifier: "Robert",
										NameIdentifierType:  ivms101.NaturalPersonNameTypeCode_NATURAL_PERSON_NAME_TYPE_CODE_LEGL,
									},
								},
							},
						},
					},
				},
			},
			AccountNumbers: []string{"1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"},
		},
		OriginatingVasp: &ivms101.OriginatingVasp{
			OriginatingVasp: &ivms101.Person{
				Person: &ivms101.Person_LegalPerson{
					&ivms101.LegalPerson{
						Name: &ivms101.LegalPersonName{
							NameIdentifiers: []*ivms101.LegalPersonNameId{
								&ivms101.LegalPersonNameId{
									LegalPersonName:               "VASP A",
									LegalPersonNameIdentifierType: ivms101.LegalPersonNameTypeCode_LEGAL_PERSON_NAME_TYPE_CODE_LEGL,
								},
							},
						},
						NationalIdentification: &ivms101.NationalIdentification{
							NationalIdentifier:     "3M5E1GQKGL17HI8CPN20",
							NationalIdentifierType: ivms101.NationalIdentifierTypeCode_NATIONAL_IDENTIFIER_TYPE_CODE_LEIX,
						},
					},
				},
			},
		},
	}
}

func ivms101Example2() *ivms101.IdentityPayload {
	return &ivms101.IdentityPayload{
		Originator: &ivms101.Originator{
			OriginatorPersons: []*ivms101.Person{
				&ivms101.Person{
					Person: &ivms101.Person_NaturalPerson{
						&ivms101.NaturalPerson{
							Name: &ivms101.NaturalPersonName{
								NameIdentifiers: []*ivms101.NaturalPersonNameId{
									&ivms101.NaturalPersonNameId{
										PrimaryIdentifier:   "Wu",
										SecondaryIdentifier: "Xinli",
										NameIdentifierType:  ivms101.NaturalPersonNameTypeCode_NATURAL_PERSON_NAME_TYPE_CODE_LEGL,
									},
								},
								LocalNameIdentifiers: []*ivms101.LocalNaturalPersonNameId{
									&ivms101.LocalNaturalPersonNameId{
										PrimaryIdentifier:   "吴",
										SecondaryIdentifier: "信利",
										NameIdentifierType:  ivms101.NaturalPersonNameTypeCode_NATURAL_PERSON_NAME_TYPE_CODE_LEGL,
									},
								},
							},
							NationalIdentification: &ivms101.NationalIdentification{
								NationalIdentifier:     "446005",
								NationalIdentifierType: ivms101.NationalIdentifierTypeCode_NATIONAL_IDENTIFIER_TYPE_CODE_RAID,
								RegistrationAuthority:  "RA000553",
							},
							CountryOfResidence: "TZ",
						},
					},
				},
			},
		},
		Beneficiary: &ivms101.Beneficiary{
			BeneficiaryPersons: []*ivms101.Person{
				&ivms101.Person{
					Person: &ivms101.Person_LegalPerson{
						&ivms101.LegalPerson{
							Name: &ivms101.LegalPersonName{
								NameIdentifiers: []*ivms101.LegalPersonNameId{
									&ivms101.LegalPersonNameId{
										LegalPersonName:               "ABC Limited",
										LegalPersonNameIdentifierType: ivms101.LegalPersonNameTypeCode_LEGAL_PERSON_NAME_TYPE_CODE_LEGL,
									},
									&ivms101.LegalPersonNameId{
										LegalPersonName:               "CBA Trading",
										LegalPersonNameIdentifierType: ivms101.LegalPersonNameTypeCode_LEGAL_PERSON_NAME_TYPE_CODE_TRAD,
									},
								},
							},
						},
					},
				},
			},
			AccountNumbers: []string{"00010190CBATRAD"},
		},
		PayloadMetadata: &ivms101.PayloadMetadata{
			TransliterationMethod: []ivms101.TransliterationMethodCode{
				ivms101.TransliterationMethodCode_TRANSLITERATION_METHOD_CODE_HANI,
			},
		},
		TransferPath: &ivms101.TransferPath{
			TransferPath: []*ivms101.IntermediaryVasp{
				&ivms101.IntermediaryVasp{
					IntermediaryVasp: &ivms101.Person{
						Person: &ivms101.Person_LegalPerson{
							&ivms101.LegalPerson{
								Name: &ivms101.LegalPersonName{
									NameIdentifiers: []*ivms101.LegalPersonNameId{
										&ivms101.LegalPersonNameId{
											LegalPersonName:               "VASP E",
											LegalPersonNameIdentifierType: ivms101.LegalPersonNameTypeCode_LEGAL_PERSON_NAME_TYPE_CODE_LEGL,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}
}

type PingResponse struct {
	Status   string `json:"status,omitempty"`
	Message  string `json:"message,omitempty"`
	ServerCN string `json:"server_cn,omitempty"`
	ClientCN string `json:"client_cn,omitempty"`
}

func mTLSConnectionTest(ctx context.Context, params url.Values, crt tls.Certificate, certPool *x509.CertPool) *PingResponse {

	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				Certificates: []tls.Certificate{crt},
				RootCAs:      certPool,
			},
		},
	}

	url := fmt.Sprintf("https://%s/ping?msg=%s", params.Get("target"), params.Get("msg"))

	req, err := http.NewRequest("GET", url, nil)

	if err != nil {
		return responseFailure(err)
	}

	res, err := client.Do(req.WithContext(ctx))
	if err != nil {
		return responseFailure(err)
	}

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return responseFailure(err)
	}

	out := &PingResponse{}
	json.Unmarshal(body, out)

	return out
}

func responseFailure(err error) *PingResponse {
	return &PingResponse{
		Message: "something went wrong",
		Status:  err.Error(),
	}
}
