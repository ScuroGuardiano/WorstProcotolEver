/**
 * Użyłem tutaj generatora, jednakże jeżeli Twój język nie ma generatorów
 * to możesz po prostu tablicę bajtów zamienić na tablicę bitów i ją zwrócić.
 * 
 * @param {Buffer} buf
 */
export function* bufBitIterator(buf) {
    for (let i = 0; i < buf.byteLength; i++) {
        const byte = buf.readUint8(i);
        for (let j = 0; j < 8; j++) {
            yield (byte >> j) & 1;
        }
    }
}

/**
 * Funkcja, która zamieni tablicę bitów na tablicę bajtów, w przypadku node.js-a
 * tablicą bajtów jest Buffer lub UInt8Array.
 * 
 * @param {BitArray} arr
 */
export function bitArrayToBuf(arr) {
    const buffer = Buffer.alloc(Math.ceil(arr.length / 8), 0);
    for (let i = 0; i < arr.length; i++) {
        const bit = arr[i];
        buffer[Math.floor(i / 8)] = buffer[Math.floor(i / 8)] | (bit << (i % 8));
    }
    return buffer;
}

// Uzywamy tutaj hamminga {15, 11}.
// To oznacza, że wiadomość jest kodowana w 11 bajtach, są ustawiane na specyficznych pozycjach
// w 16 bitowym bloku, które wypisałem tutaj.
export const hamming15_11BitPositions = [3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];

/**
 * Funkcja obliczająca bity parzystości w 16 bitowym bloku.
 * @param {number} word  
 */
export function calculateParityBits(word) {
    let res = 0;
    let posNeededToTurn = 0;
    let singleParityBit = 0;

    // Każdy bit parzystości z kodowania hamminga znajduje się na pozycji, która
    // jest potęgą dwójki. Robiąc operację xor na wszystkich pozycjach 16 bitowego
    // bloku jako rezultat dostaniemy 4 bitową liczbę binarną, którą wykorzystamy niżej.
    for (let i = 0; i < 11; i++) {
        const bit = word >> hamming15_11BitPositions[i] & 1;
        singleParityBit ^= bit; // Do obliczeń bitu parzystości, wytłumaczenie niżej
        if (bit) {
            posNeededToTurn ^= hamming15_11BitPositions[i];
        }
    }
    
    // Otrzymaliśmy z operacji wyżej 4 bitową liczbę.
    // Każdy bit tej liczby oznacza czy na danej pozycji powinniśmy ustawić bit parzystości
    // Przykładowo dla liczby 1010 musimy ustawić bit parzystości na pozycji 0010 oraz 1000
    // czyli na 2 oraz 8.
    for (let i = 0; i < 4; i++) {
        const bit = (posNeededToTurn >> i) & 1;
        singleParityBit ^= bit; // Do obliczeń bitu parzystości, wytłumaczenie niżej
        if (bit) {
            res |= 1 << 2 ** i;
        }
    }

    // Obliczamy bit parzystości dokonując operacji xor na wszystkich bitach
    // Najlepiej będzie wyjaśnić na przykładzie dlaczego to działa:
    // 1 xor 1 xor 1 = 1
    // 1 xor 1 xor 0 = 0
    // Przy nieparzystej liczbie bitów xor zawsze da nam wynik 1, a przy parzystej da nam 0
    // Więc możemy ten wynik ustawić jako bit parzystości
    res |= singleParityBit;

    return res;
}

/**
 * Zakoduje wiadomość przy użyciu rozszerzonego kodowania hamminga {15, 11}.
 * 
 * Kodowanie odbywa się przy użyciu 11 bajtowych bloków wiadomości, jeżeli wiadomość nie jest
 * wielokrotnością 11 bajtów, to reszta zostanie wypełniona zerami.
 * 
 * Jest to użyte w celu ułatwienia.
 * 
 * @param {Buffer} buf 
 */
export function hammingEncode(buf) {
    const _128BitBlocks = Math.ceil(buf.byteLength / 11);
    const temp = Buffer.alloc(_128BitBlocks * 11, 0);
    buf.copy(temp);
    const encoded = Buffer.alloc(_128BitBlocks * 16, 0);

    let word = 0;
    let i = 0;
    for (let bit of bufBitIterator(temp)) {
        if (i !== 0 && i % 11 === 0) {
            word |= calculateParityBits(word);
            encoded.writeUint16LE(word, i / 11 * 2 - 2);
            word = 0;
        }
        word |= bit << hamming15_11BitPositions[i % 11];

        i++;
    }
    word |= calculateParityBits(word);
    encoded.writeUint16LE(word, i / 11 * 2 - 2);

    return encoded;
}

/**
 * Zweryfikuje wiadomość i poprawi jednobitowy błąd. W przypadku 2 bitowego błędu
 * zwróci informację, że nie udało się zdekodować wiadomości
 * 
 * @param {number} word 
 * @returns { { unrecovableError: boolean, word: number } }
 */
export function hammingErrorCheck(word) {
    let errorPos = 0;
    let parityBit = 0;
    for (let i = 0; i < 16; i++) {
        const bit = (word >> i) & 1;
        parityBit ^= bit; // xor our friend <3
        if (bit) {
            // Teraz coś super cool o kodowaniu hamminga
            // Jeżeli wykonamy operację xor na pozycjach, na których wartość bitu
            // wynosi 1, to w przypadku jednobitowego błędu otrzymamy dokładną pozycję
            // Na której bit został przekłamany...
            errorPos ^= i;
        }
    }

    if (errorPos) {
        // ... więc, możemy to po prostu naprawić
        // ale napierw sprawdzimy parzystość, robimy tu xor-a z jedynką,
        // ponieważ mieliśmy przekłamany jeden bit, więc żeby parzystość była poprawna
        // musimy ustawić go na 1
        parityBit ^= 1;
        if (parityBit !== 0) {
            // Jeżeli teraz parzystość się nie zgadza, to mamy co najmniej 2 bitowe
            // przekłamanie. Tego już nie naprawimy, niestety. Więc zwracamy błąd i nie zmodyfikowane
            // słowo wiadomości.
            return { unrecovableError: true, word };
        }

        // Flipujemy bita na pozycji błędu ^^
        word ^= 1 << errorPos;
    }

    return { unrecovableError: false, word };
}

/**
 * Zdekoduje wiadomość zakodowaną przez kodowanie hamminga.
 * 
 * @param {Buffer} buf 
 */
export function hammingDecode(buf) {
    if (buf.byteLength % 16 !== 0) {
        throw new Error("Invalid buffer, it must contain blocks of 16 bytes length");
    }

    const _128BitBlocks = buf.byteLength / 16;
    let decoded = Buffer.alloc(11 * _128BitBlocks, 0);
    
    let valid = true;

    for (let i = 0; i < _128BitBlocks; i++) {
        const bits = [];
        const block = buf.subarray(i * 16, i * 16 + 16);
        for (let j = 0; j < 8; j++) {
            let word = block.readUint16LE(j * 2);
            const errorFix = hammingErrorCheck(word);
            if (errorFix.unrecovableError) {
                console.log("UNRECOVERABLE ERROR OCCURED!");
                valid = false;
            }
            word = errorFix.word;

            for (let k = 0; k < 11; k++) {
                bits.push((word >> hamming15_11BitPositions[k]) & 1)
            }
        }
        const b = bitArrayToBuf(bits);
        b.copy(decoded, i * 11);
    }
    
    return { valid, decoded };
}
