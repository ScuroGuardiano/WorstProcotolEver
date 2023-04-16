import dgram from 'node:dgram';
const server = dgram.createSocket('udp4');

const client1 = "127.0.0.1:1999";
const client2 = "127.0.0.1:2001";
const corruptionPropability = 0.10;

/**
 * 
 * @param {Buffer} data 
 */
function corruptData(data) {
  let corrupted = 0;
    for (let i = 0; i < data.byteLength; i++) {
        const random = Math.random();
        if (random <= corruptionPropability) {
            const randomByte = Math.floor(Math.random() * 256);
            data.writeUint8(randomByte, i);
            corrupted++;
        }
    }
    console.log(`Corrupted ${corrupted} bytes.`);
}

server.on('error', (err) => {
  console.error(`server error:\n${err.stack}`);
  server.close();
});

server.on('message', (msg, rinfo) => {
  console.log(`server got message from ${rinfo.address}:${rinfo.port}, len: ${msg.byteLength}`);
  let [targetHost, targetPort] = client1.split(':');
  if (`${rinfo.address}:${rinfo.port}` === client1) {
    [targetHost, targetPort] = client2.split(':');
  }
  corruptData(msg);

  server.send(msg, targetPort, targetHost);
});

server.on('listening', () => {
  const address = server.address();
  console.log(`server listening ${address.address}:${address.port}`);
});

server.bind(2000, "127.0.0.1");