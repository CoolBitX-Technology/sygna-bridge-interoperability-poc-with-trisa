package handler

import (
	"context"
	"crypto/elliptic"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"

	bridgeutil "github.com/CoolBitX-Technology/sygna-bridge-util-go"
	"github.com/ethereum/go-ethereum/crypto/secp256k1"
	"github.com/golang/protobuf/ptypes"
	log "github.com/sirupsen/logrus"
	trisaBe "github.com/trisacrypto/trisa/proto/trisa/identity/be/v1alpha1"
	sygnaIdentity "github.com/trisacrypto/trisa/proto/trisa/identity/sygna/v1alpha1"
	pb "github.com/trisacrypto/trisa/proto/trisa/protocol/v1alpha1"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/peer"
)

func NewDemoHandler(pk string, directory map[string]string) *Demo {
	privKeyBigInt, _ := new(big.Int).SetString(pk, 16)
	x, y := secp256k1.S256().ScalarBaseMult(privKeyBigInt.Bytes())
	publicKeyBytes := elliptic.Marshal(secp256k1.S256(), x, y)

	privateKeyHex, _ := hex.DecodeString(pk)
	return &Demo{
		privateKey: privateKeyHex,
		publicKey:  publicKeyBytes,
		directory:  directory,
	}
}

type Demo struct {
	privateKey []byte
	publicKey  []byte
	directory  map[string]string
}

func (d *Demo) HandleRequest(ctx context.Context, id string, req *pb.TransactionData) (*pb.TransactionData, error) {

	if HasClientSideFromContext(ctx) {
		identityType, _ := ptypes.AnyMessageName(req.Identity)
		var identityData ptypes.DynamicAny
		ptypes.UnmarshalAny(req.Identity, &identityData)

		log.WithFields(log.Fields{
			"identity-type": identityType,
			"identity":      fmt.Sprintf("%v", identityData),
		}).Infof("received transaction confirmation for %s", id)
		return nil, fmt.Errorf("EOL")
	}

	p, ok := peer.FromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no peer found")
	}

	tlsAuth, ok := p.AuthInfo.(credentials.TLSInfo)
	if !ok {
		return nil, fmt.Errorf("unexpected peer transport credentials")
	}

	if len(tlsAuth.State.VerifiedChains) == 0 || len(tlsAuth.State.VerifiedChains[0]) == 0 {
		return nil, fmt.Errorf("could not verify peer certificate")
	}

	// Extract identity
	identityType, _ := ptypes.AnyMessageName(req.Identity)
	cn := tlsAuth.State.VerifiedChains[0][0].Subject.CommonName
	// Extract network information
	networkType, _ := ptypes.AnyMessageName(req.Data)
	var networkData ptypes.DynamicAny
	ptypes.UnmarshalAny(req.Data, &networkData)

	// trisa.identity.sygna.v1alpha1.Identity
	switch identityType {
	case "trisa.identity.sygna.v1alpha1.Identity":
		var identityData sygnaIdentity.Identity
		ptypes.UnmarshalAny(req.Identity, &identityData)

		plainTextIdentity, _ := bridgeutil.Decrypt(hex.EncodeToString(identityData.EncryptedIdentity), hex.EncodeToString(d.privateKey))
		planTextIdentityJSON, _ := json.Marshal(plainTextIdentity)

		log.WithFields(log.Fields{
			"identity-type": identityType,
			"network-type":  networkType,
			// "identity":             fmt.Sprintf("%v", identityData),
			"network":              fmt.Sprintf("%v", networkData),
			"sygna-identity":       fmt.Sprintf("%v", string(planTextIdentityJSON)),
			"originator-vasp-code": identityData.OriginatorVaspCode,
		}).Infof("received transaction %s from %s", id, cn)

		// encrypt identity with other's public key
		targetVaspCode := ctx.Value(string("targetVaspCode"))
		if targetVaspCode == nil {
			targetVaspCode = identityData.OriginatorVaspCode
		}

		encryptedHex, _ := bridgeutil.EncryptString(string(planTextIdentityJSON), d.directory[targetVaspCode.(string)])
		encryptedBytes, _ := hex.DecodeString(encryptedHex)
		returnIdentityData := &sygnaIdentity.Identity{
			EncryptedIdentity: encryptedBytes,
		}
		anyResultIdentity, _ := ptypes.MarshalAny(returnIdentityData)

		// Extract identity
		returnIdentityType, _ := ptypes.AnyMessageName(anyResultIdentity)

		log.WithFields(log.Fields{
			"identity-type": returnIdentityType,
			"identity":      fmt.Sprintf("%v", returnIdentityData),
		}).Infof("sent transaction response for %s to %s", id, cn)

		return &pb.TransactionData{
			Identity: anyResultIdentity,
		}, nil
	default:
		var identityData ptypes.DynamicAny
		ptypes.UnmarshalAny(req.Identity, &identityData)

		// Extract identity
		identityType, _ = ptypes.AnyMessageName(req.Identity)

		log.WithFields(log.Fields{
			"identity-type": identityType,
			"network-type":  networkType,
			// "identity":      fmt.Sprintf("%v", identityData),
			"network": fmt.Sprintf("%v", networkData),
		}).Infof("received transaction %s from %s", id, cn)

		// Generate demo response
		identityResp := &trisaBe.Identity{
			FirstName:      "Jane",
			LastName:       "Foe",
			NationalNumber: "109-800211-69",
			CityOfBirth:    "Zwevezele",
		}
		identityRespSer, _ := ptypes.MarshalAny(identityResp)

		tData := &pb.TransactionData{
			Identity: identityRespSer,
		}

		// Extract identity
		identityType, _ = ptypes.AnyMessageName(identityRespSer)

		log.WithFields(log.Fields{
			"identity-type": identityType,
			"identity":      fmt.Sprintf("%v", identityResp),
		}).Infof("sent transaction response for %s to %s", id, cn)

		return tData, nil
	}
}
