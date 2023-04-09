import dgram from "node:dgram";
import crypto from "node:crypto";
import { hammingDecode, hammingEncode } from "./hamming.mjs";

const PacketType = {
    MSG: 1, // wiadomość
    ACK: 2  // potwierdzenie
}

/**
 * 
 * @param {Buffer} message 
 */
function addHashToMessage(message) {
    const hash = crypto.createHash('md5').update(message).digest();
    return Buffer.concat([hash, message]);
}

/**
 * 
 * @param {Buffer} rawPacket 
 */
function parsePacket(rawPacket) {
    if (rawPacket.length < 18) {
        return { valid: false }
    }
    const { decoded, valid: hammingValid } = hammingDecode(rawPacket);

    const hash = decoded.subarray(0, 16);
    const paddingSize = decoded.readUint8(17);
    
    let end = decoded.byteLength - paddingSize;

    if (end < 18) {
        // Wykonujemy to aby uniknąć jakiegoś wyjątku w przypadku
        // przekłamania `paddingSize` nie wyłapanego przez kodowania Hamminga
        end = 18;
    }
    const restOfPacket = decoded.subarray(16, end);
    const type = restOfPacket.subarray(0, 1);

    const message = restOfPacket.subarray(2);

    return {
        message,
        type: type.readUint8(),
        valid: hammingValid && verifyPacket(hash, restOfPacket)
    }
}

/**
 * 
 * @param {Buffer} hash 
 * @param {Buffer} data 
 */
function verifyPacket(hash, data) {
    // Obliczamy hash danych w pakiecie
    const hashOfData = crypto.createHash('md5').update(data).digest();
    // I porównujemy je z hashem z pakietu
    // Funkcja `compare` zwraca 0 jeżeli bufory są równe.
    return hashOfData.compare(hash) === 0;
}

/**
 * 
 * @param {1 | 2} type 
 * @param {(Buffer | string)?} message 
 */
function createPacket(type, message) {
    // Sprawdzenie czy typ jest poprawny
    if (!Object.values(PacketType).includes(type)) {
        throw new Error(`Type ${type} is not allowed!`);
    }
    const packetType = Buffer.alloc(1, type);
    const paddingSize = Buffer.alloc(1, 0);
    
    let packet;

    switch (type) {
        case PacketType.ACK: {
            paddingSize.writeUint8((1 + 16) % 11);
            const payload = Buffer.concat([packetType, paddingSize]);
            packet = addHashToMessage(payload);
            break;
        }
        case PacketType.MSG:
            message = message ?? ""; // Jeżeli wiadomość jest nullem to damy pustego stringa.
            // Musimy zamienić wiadomość na bufor, czyli reprezetację bajtową.
            // Gdyż niżej operujemy na buforach
            if (!(message instanceof Buffer)) {
                message = Buffer.from(message);
            }

            paddingSize.writeUint8(11 - (paddingSize.byteLength + packetType.byteLength + 16 + message.byteLength) % 11);

            const payload = Buffer.concat([packetType, paddingSize, message]);
            packet = addHashToMessage(payload);
            break;
    }

    return hammingEncode(packet);
}

export class WPSocket {
    sendQueue = [];
    lastSentRawPacket = null;
    timeoutTime = 1000;
    interval = null;

    /**
     * 
     * @param {Buffer} msg 
     * @param {dgram.RemoteInfo} rinfo 
     */
    processMessage(msg, rinfo) {
        const packet = parsePacket(msg);
        if (!packet.valid) {
            console.log("RECEIVED INVALID PACKET!");
            return;
        }

        switch (packet.type) {
            case PacketType.ACK:
                if (this.interval) {
                    clearInterval(this.interval);
                }
                break;
            case PacketType.MSG:
                this.messageCallbacks.forEach(c => c(packet.message, rinfo));
                this.sendAck(rinfo.port, rinfo.address);
                break;
            default:
                console.log(packet.type);
                console.warn(`Packet type ${packet.type} is not supported.`);
        }
    }

    /**
     * 
     * @param {Buffer | string} msg 
     * @param {number} targetPort 
     * @param {string} targetAddress 
     */
    send(msg, targetPort, targetAddress) {
        const packet = createPacket(PacketType.MSG, msg);
        this.sendPacket(packet, targetPort, targetAddress, true);
    }

    /**
     * 
     * @param {number} targetPort 
     * @param {string} targetAddress 
     */
    sendAck(targetPort, targetAddress) {
        const packet = createPacket(PacketType.ACK);
        this.sendPacket(packet, targetPort, targetAddress, false);
    }

    /**
     * 
     * @param {Buffer} packet 
     * @param {number} targetPort 
     * @param {string} targetAddress 
     * @param {boolean} retryUntilAcknowledged
     */
    sendPacket(packet, targetPort, targetAddress, retryUntilAcknowledged) {
        this.internalSocket.send(packet, targetPort, targetAddress);
        this.lastSentRawPacket = packet;
        if (retryUntilAcknowledged) {
            this.interval = setInterval(() => {
                this.sendPacket(packet, targetPort, targetAddress);
            }, this.timeoutTime);
        }
    }
    
    internalSocket = dgram.createSocket('udp4');

    listeningCallbacks = [];
    messageCallbacks = [];
    errorCallbacks = [];

    constructor() {
        this.internalSocket.on('listening', () => {
            this.listeningCallbacks.forEach(c => c())
        });

        this.internalSocket.on('error', (err) => {
            this.errorCallbacks.forEach(c => c(err));
        });

        this.internalSocket.on('message', this.processMessage.bind(this));
    }

    /**
     * 
     * @param {string} host 
     * @param {number} port 
     */
    bind(port, host) {
        this.internalSocket.bind(port, host);
    }

    /**
     * 
     * @param {(msg: Buffer, rinfo: dgram.RemoteInfo) => void} callback 
     */
    onMessage(callback) {
        this.messageCallbacks.push(callback);
    }

    /**
     * 
     * @param {(err: any) => void} callback 
     */
    onError(callback) {
        this.errorCallbacks.push(callback);
    }

    /**
     * 
     * @param {() => void} callback 
     */
    onListening(callback) {
        this.listeningCallbacks.push(callback);
    }

    close() {
        this.internalSocket.close();
    }
}
