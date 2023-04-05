import dgram from "node:dgram";
import crypto from "node:crypto";

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
    if (rawPacket.length < 16) {
        return { valid: false }
    }
    const hash = rawPacket.subarray(0, 16);
    const message = rawPacket.subarray(16);
    return {
        message,
        valid: verifyPacket(hash, message)
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

export class WPSocket {
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

        this.messageCallbacks.forEach(c => c(packet.message, rinfo));
    }

    /**
     * 
     * @param {Buffer} msg 
     * @param {number} targetPort 
     * @param {string} targetAddress 
     */
    send(msg, targetPort, targetAddress) {
        // Musimy zamienić wiadomość na bufor, czyli reprezetację bajtową.
        // Gdyż za pomocą metody `addHashToMessage` wykonujemy operację na buforach.
        if (!(msg instanceof Buffer)) {
            msg = Buffer.from(msg);
        }
        const messageWithHash = addHashToMessage(msg);
        this.internalSocket.send(messageWithHash, targetPort, targetAddress);
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
