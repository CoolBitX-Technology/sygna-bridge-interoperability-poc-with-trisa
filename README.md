# Sygna Bridge Interoperability PoC with TRISA

## Introduction
SYGNA gateway acts as a protocol translator which can perform protocol and message conversions to connect networks with the different technologic approach.

SYGNA gateway requires the establishment of mutually acceptable administrative procedures between the networks using the gateway, such as the VASP certificate-status check proposed by TRISA.

![Sygna Trisa Network](/images/sygna-trisa-network.jpg)


## Setup
* You will need `make`, `docker`, `docker-compose`, `curl` installed on your system to run this demo
* Generate local certificate using TRISA's pki tool
  ```
  cd packages/trisa-vasp && make pki-dev-init && cd ../..
  ```
* Copy `config.template.json` into `config.json` and fill your data
  * You will need a public endpoint to receive bridge's callback
  * For simplicity, this demo use same private key and vasp code for both gateway and TRISA vasp
  * `sygna.privateKey` should equal `identity.privateKey`
  * `gateway.vaspCode` should equal `identity.vaspCode`
  * Fields without <> can leave untouched
* Build docker containers
  > This step can take up to 15 mins
  ```
  docker-compose build
  ```
* Start containers
  ```
  docker-compose up
  ```

## Test with robot VASP
* Use `curl` to instruct TRISA Vasp node to send permission request to robot Vasp
```
curl -k "https://127.0.0.1:8592/send?target=vasp1:8877&example=sygna&targetVaspCode=ROBOTWAA"
```
* In this example:
  * `target=vasp1:8877`: Instruct TRISA node to send request to another vasp at `vasp1:8877`, in this demo this is sygna gateway
  * `example=sygna`: TRISA node support various identity data format, in this demo we use `sygna`
  * `targetVaspCode=ROBOTWAA`: Set target sygna vasp code in `sygna` identity data

## If you want to test against another VASP
  * Simply change targetVaspCode to desired one
  ```
  curl -k "https://127.0.0.1:8592/send?target=vasp1:8877&example=sygna&targetVaspCode=<YOUR-VASP-CODE>"
  ```