import { CustomKoaContext } from '../../types';
import $ from '../../config';
import NetkiPayment from '../../generated/netki/payment_pb';
import crypto from "crypto";

export default async (ctx: CustomKoaContext): Promise<number> => {
  const body = ctx.request.body;
  console.log(JSON.stringify(body, null, 2))

  const netkiRequest = new NetkiPayment.InvoiceRequest();
  netkiRequest.setAmount(parseFloat(body.data.transaction.amount));
  netkiRequest.setMemo("Request transformed by Sygna gateway");
  // TODO: fill gateway's endpoint
  netkiRequest.setNotificationUrl("SOME GATEWAY ENDPOINT");

  // set outputs
  const output = new NetkiPayment.Output();
  output.setAmount(parseFloat(body.data.transaction.amount));
  // TODO: transform sygna currency id to netki CurrencyType
  output.setCurrency(NetkiPayment.CurrencyType.BITCOIN);
  // not sure
  output.setScript(Buffer.from(body.data.transaction.beneficiary_vasp.addrs[0].address));
  netkiRequest.addOutputs(output);
  // netkiRequest.addOwners(new NetkiPayment.Owner());

  // TODO: get from request
  netkiRequest.addAttestationsrequested(NetkiPayment.AttestationType.LEGAL_PERSON_PRIMARY_NAME);
  netkiRequest.addAttestationsrequested(NetkiPayment.AttestationType.LEGAL_PERSON_SECONDARY_NAME);
  netkiRequest.addAttestationsrequested(NetkiPayment.AttestationType.BIRTH_DATE);
  netkiRequest.addAttestationsrequested(NetkiPayment.AttestationType.ACCOUNT_NUMBER);

  netkiRequest.setSenderPkiType("x509+sha256");
  // TODO: read gateway certificate
  netkiRequest.setSenderPkiData(Buffer.from($.TLS_CERTIFICATE));
  netkiRequest.setSenderSignature(Buffer.from(""));
  // TODO: fill vasp name
  netkiRequest.setRecipientVaspName("Some Netki VASP");
  // not sure
  netkiRequest.setRecipientChainAddress(body.data.transaction.beneficiary_vasp.addrs[0].address);

  netkiRequest.setSygnaTransferId(body.transfer_id);
  netkiRequest.setSygnaEncryptedOwner(Buffer.from(body.data.private_info, "hex"));

  // sign message
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(netkiRequest.serializeBinary());
  const signature = sign.sign($.TLS_PRIVATE_KEY, "base64");
  netkiRequest.setSenderSignature(Buffer.from(signature));

  // wrap invoice request to message
  const message = new NetkiPayment.ProtocolMessage();
  message.setVersion(1);
  message.setStatusCode(1);
  message.setMessageType(NetkiPayment.ProtocolMessageType.INVOICE_REQUEST);
  message.setSerializedMessage(netkiRequest.serializeBinary());
  message.setStatusMessage("OK");
  // TODO: should be hash
  message.setIdentifier(Buffer.from(body.transfer_id));

  // send to somewhere, for now we'll just return
  ctx.body = Buffer.from(message.serializeBinary())
  return (ctx.status = 200);
};
