package config

import (
	"encoding/json"
	"io/ioutil"
	"os"
)

type ConfigAll struct {
	C *Config `json:"trisa"`
}

// Config represents the Trisa Server configuration.
type Config struct {
	TLS       *TLS              `json:"tls"`
	Server    *Server           `json:"server"`
	Identity  *Identity         `json:"identity"`
	Directory map[string]string `json:"directory"`
}

type TLS struct {
	PrivateKeyFile  string `json:"privateKeyFile"`
	CertificateFile string `json:"certificateFile"`
	TrustChainFile  string `json:"trustChain"`
}

type Server struct {
	ListenAddress      string `json:"grpcApiPort"`
	ListenAddressAdmin string `json:"restApiPort"`
	Hostname           string `json:"endpoint"`
}

type Identity struct {
	PrivateKey string `json:"privateKey"`
	VaspCode   string `json:"vaspCode"`
}

func FromFile(file string) (*Config, error) {
	data, err := ioutil.ReadFile(file)
	if err != nil {
		return nil, err
	}

	var c ConfigAll

	err = json.Unmarshal(data, &c)
	if err != nil {
		return nil, err
	}

	return c.C, nil
}

func (c *Config) Save(file string) error {
	out, err := json.Marshal(c)
	if err != nil {
		return err
	}
	return ioutil.WriteFile(file, out, os.ModePerm)
}
