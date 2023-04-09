# Worst Protocol Ever
> PL only, sorry

Moja dziewczyna dostała takie zadanko na studiach:

Mamy dwóch klientów oraz serwer, komunikują się po UDP. Klient 1 wysyła wiadomość do serwera, a serwer przesyła ją do klienta 2. Serwer działa w trybie zakłóceń, ma 10% szans na zamienienie każdego bajtu wiadomości na losowy przed przesłaniem dalej.  
```mermaid
flowchart LR
    A[Klient 1]-->B[Serwer]-->|Możliwie uszkodzona wiadomość|C[Klient 2]
```

Musimy znaleźć sposób na przesłanie danych poprawnie pomimo tych zakłóceń wykorzystując różne techniki, takie jak:
- Sumy kontrolne
- Retransmisje oraz potwierdzenia
- Dzielenie informacji na mniejsze bloki
- Nadmiarowość

Jako ostateczny test musimy przesłać 50000 bajtów, a sam protokół ma być jak najefektywnieszy. Wykorzystamy prawie wszystkie te techniki, więc zaczynajmy!

## Przygotowanie
Przygotujmy sobie bazowy kod. Napiszę to wszystko w JavaScript z wykorzystaniem nodejs, gdyż jest to język, który dobrze znam. Ponadto będziemy mogli się lepiej skupić na samej implementacji protokołu, a kod będzie bardziej zwięzły.

Stworzymy sobie najpierw plik `server.mjs`, a w nim wklejamy kod z naszych założeń serwera:
```js
import dgram from 'node:dgram';
const server = dgram.createSocket('udp4');

const client1 = "127.0.0.1:1999";
const client2 = "127.0.0.1:2001";
const corruptionPropability = 0.1;

/**
 * 
 * @param {Buffer} data 
 */
function corruptData(data) {
    for (let i = 0; i < data.byteLength; i++) {
        const random = Math.random();
        if (random <= corruptionPropability) {
            const randomByte = Math.floor(Math.random() * 256);
            data.writeUint8(randomByte, i);
        }
    }
}

server.on('error', (err) => {
  console.error(`server error:\n${err.stack}`);
  server.close();
});

server.on('message', (msg, rinfo) => {
  console.log(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
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
```
Tego kodu nie będziemy modyfikować.

Następnie utwórzmy plik `wpsocket.mjs`, tutaj będzie kod naszego protokołu:
```js
import dgram from "node:dgram";

export class WPSocket {
    /**
     * 
     * @param {Buffer} msg 
     * @param {dgram.RemoteInfo} rinfo 
     */
    processMessage(msg, rinfo) {
        this.messageCallbacks.forEach(c => c(msg, rinfo));
    }

    /**
     * 
     * @param {Buffer} msg 
     * @param {number} targetPort 
     * @param {string} targetAddress 
     */
    send(msg, targetPort, targetAddress) {
        this.internalSocket.send(msg, targetPort, targetAddress);
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
```

Tak wiem, dużo się tu dzieje, nas jednak obchodzą jedynie metody `processMessage` oraz `send`. W `processMessage` będziemy przetwarzać odebraną z serwera uszkodzoną wiadomość, a w send będziemy kodować.

Teraz utwórzmy klientów, którzy wykorzystają nasz `WPSocket`, plik `client1.mjs`:
```js
import { WPSocket } from './wpsocket.mjs';
const client = new WPSocket();

const server = "127.0.0.1:2000";
const [serverHost, serverPort] = server.split(':');

client.onError((err) => {
  console.error(`server error:\n${err.stack}`);
  client.close();
});

client.onMessage((msg, rinfo) => {
  console.log(`Client got: ${msg} from ${rinfo.address}:${rinfo.port}`);
});

client.onListening(() => {
  const address = client.internalSocket.address();
  console.log(`client listening ${address.address}:${address.port}`);
});

client.bind(1999, "127.0.0.1");

const data = `
Litwo! Ojczyzno moja! ty jesteś jak zdrowie.
Ile cię trzeba cenić, ten tylko się dowie,
Kto cię stracił. Dziś piękność twą w całej ozdobie
Widzę i opisuję, bo tęsknię po tobie.
Panno Święta, co Jasnej bronisz Częstochowy
I w Ostrej świecisz Bramie! Ty, co gród zamkowy
Nowogródzki ochraniasz z jego wiernym ludem!
Jak mnie dziecko do zdrowia powróciłaś cudem
(Gdy od płaczącej matki pod Twoję opiekę
Ofiarowany, martwą podniosłem powiekę
I zaraz mogłem pieszo do Twych świątyń progu
Iść za wrócone życie podziękować Bogu),
Tak nas powrócisz cudem na Ojczyzny łono.
Tymczasem przenoś moję duszę utęsknioną
Do tych pagórków leśnych, do tych łąk zielonych,
Szeroko nad błękitnym Niemnem rozciągnionych;
Do tych pól malowanych zbożem rozmaitem,
Wyzłacanych pszenicą, posrebrzanych żytem;
Gdzie bursztynowy świerzop, gryka jak śnieg biała,
Gdzie panieńskim rumieńcem dzięcielina pała,
A wszystko przepasane, jakby wstęgą, miedzą
Zieloną, na niej z rzadka ciche grusze siedzą.`

client.send(data, serverPort, serverHost);
```

Oraz plik `client2.mjs`:
```js
import { WPSocket } from './wpsocket.mjs';
const client = new WPSocket();

client.onError((err) => {
  console.error(`server error:\n${err.stack}`);
  client.close();
});

client.onMessage((msg, rinfo) => {
  console.log(`Client got: ${msg} from ${rinfo.address}:${rinfo.port}`);
});

client.onListening(() => {
  const address = client.internalSocket.address();
  console.log(`client listening ${address.address}:${address.port}`);
});

client.bind(2001, "127.0.0.1");
```

Otwórzmy teraz 3 okna terminala, wpiszmy w dwóch pierwszych:
1. `node server.mjs`
2. `node client2.mjs`

Teraz za każdym razem jak w trzecim oknie wpiszemy `node client1.mjs` zostanie wysłana inwokacja z *Pana Tadeusza* Adama Mickiewicza do serwera, serwer uszkodzi ją i prześle do klienta 2.
Oto co otrzymujemy na drugim kliencie:
![Wiadomość z błędami](screens/screen1.png)
Naszym celem jest teraz zmodyfikowanie metod `processMessage` oraz `send` w klasie `WPSocket`, tak aby klient 2 dostał ładną, bezbłędną inwokację.


## Wykrywanie przekłamań
Żeby uznać pakiet za błędny musimy wiedzieć, że jest on błędny. Ludzkim okiem potrafimy ocenić, że wiadomość nie jest taka jaka być powinna, ale komputer musi mieć mechanizm do sprawdzenia tego.

Istnieją różne metody sprawdzenia czy wiadomość dotarła, może to być
- Sprawdzanie parzystości bitów
- Suma kontrolna
- CRC
- Hashe

Niestety nasze zakłócenia są dosyć wysokie, więc żadna metoda nie da nam 100% pewności, że wykryliśmy błąd. Ale hash da największe prawdopodobieństwo, więc to go użyję. Użyję w tym przypadku MD5. MD5 nie jest już kryptograficznie bezpieczną funkcją hashującą, ale do wykrycia błędu będzie całkowicie wystarczająca. Szansa na wygenerowanie 2 takich samych hashy wynosi 1.47*10^-29, więc można powiedzieć, że jest pomijalna.

Hash dodamy do początku wiadomości, MD5 ma 16 bajtów, więc pierwsze 16 bajtów wiadomości to będzie hash.

Nasza wysłana wiadomość będzie więc wyglądała tak:
```
|------------------------|
| 128 bit MD5 | Message  |
|------------------------|
```

Zaimplementujmy zatem hashowanie wiadomości i dodawanie hasha na jej początek. Dodajmy sobie funkcję w naszym pliku `wpsocket.mjs` o nazwie `addHashToMessage`, a w niej:
```js
function addHashToMessage(message) {
    const hash = crypto.createHash('md5').update(message).digest();
    return Buffer.concat([hash, message]);
}
```

A następnie wykorzystajmy tę funkcję do wysłania wiadomości, zmodyfikujmy metodę `send`:
```js
send(msg, targetPort, targetAddress) {
    // Musimy zamienić wiadomość na bufor, czyli reprezetację bajtową.
    // Gdyż za pomocą metody `addHashToMessage` wykonujemy operację na buforach.
    if (!(msg instanceof Buffer)) {
        msg = Buffer.from(msg);
    }
    const messageWithHash = addHashToMessage(msg);
    this.internalSocket.send(messageWithHash, targetPort, targetAddress);
}
```

Dodajmy funkcję weryfikującą poprawność pakietu o nazwie `verifyPacket`, której przekażemy hash oraz zawartość pakietu.
```js
function verifyPacket(hash, data) {
    // Obliczamy hash danych w pakiecie
    const hashOfData = crypto.createHash('md5').update(data).digest();
    // I porównujemy je z hashem z pakietu
    // Funkcja `compare` zwraca 0 jeżeli bufory są równe.
    return hashOfData.compare(hash) === 0;
}
```

Dodajmy jeszcze funkcję `parsePacket`, która zwróci nam obiekt zawierający wiadomość oraz informację czy pakiet prawidłowy:
```js
function parsePacket(rawPacket) {
    if (rawPacket.length < 16) {
        return { invalid: true }
    }
    const hash = rawPacket.subarray(0, 16);
    const message = rawPacket.subarray(16);
    return { hash, message };
}
```


Możemy teraz zmodyfikować metodę `processMessage`, żeby wykorzystywała naszą funkcję `parsePacket`:
```js
processMessage(msg, rinfo) {
    const packet = parsePacket(msg);
    if (!packet.valid) {
        console.log("RECEIVED INVALID PACKET!");
        return;
    }

    this.messageCallbacks.forEach(c => c(packet.message, rinfo));
}
```
W przypadku niepoprawnej wiadomości wypiszemy informację o tym na konsolce.
Możemy teraz zrestartować proces klienta 2, oraz uruchomić klienta 1, żeby zobaczyć czy nasza weryfikacja działa.

Zweryfikujmy czy nasza metoda weryfikacji zadziała dla poprawnych wiadomości, zmieniając na chwilę linjkę w pliku `server.mjs`:
```js
const corruptionPropability = 0.1;
```
w pliku `server.mjs`, na
```js
const corruptionPropability = 0.0;
```
Zrestartujmy serwer, uruchomny na nowo clienta 1 i powiniśmy zobaczyć u klienta 2, że wiadomość dotarła.
> PAMIĘTAJ O PRZYWRÓCENIE PARAMETRU `corruptionPropability` NA `0.1`!!!

Dodaliśmy tą metodą do wiadomości 16 bajtów, więc mamy 16 bajtów nadmiaru póki co.

## Potwierdzenia otrzymania poprawnej odpowiedzi i wysyłanie wiadomości ponownie
Mamy już sposób wykrycia błędnej wiadomości, teraz musimy coś z tym zrobić.

Pierwszy raz projektuję swój własny protokół, więc miałem tutaj zagwozdkę, w jaki sposób to możnaby zrobić. Miałem pomysł z numerowaniem pakietów, przechowywaniem listy pakietów, które zostały wysłane i wysyłanie poprawne na prośbę klienta. Jest to jednak strasznie skomplikowane, więc stwierdziłem, że sprawdzę jak jest to realizowane przez znane protokoły. Padło na chyba najprostszy protokół do przesyłania danych, TFTP.

Jak możemy przeczytać w [RFC 1350 - THE TFTP PROTOCOL (REVISION 2)](https://www.rfc-editor.org/rfc/rfc1350):
> Each data packet contains one block of
   data, and must be acknowledged by an acknowledgment packet before the
   next packet can be sent. [...]  
> If a packet gets lost in the
   network, the intended recipient will timeout and may retransmit his
   last packet (which may be data or an acknowledgment), thus causing
   the sender of the lost packet to retransmit that lost packet.  The
   sender has to keep just one packet on hand for retransmission, since
   the lock step acknowledgment guarantees that all older packets have
   been received.

Genialne w swojej prostocie, ale zamiast odbiorca wysyłać pakiet po timeoucie, to nasz nadawca będzie timeoutował jeżeli nie dostanie odpowiedzi potwierdzającej. Jeżeli nasz odbiorca dostanie drugi taki sam poprawny pakiet, to go odrzuci (możemy sprawdzić po hashu). Musimy tylko dodać typ pakietu do naszej wiadomości, który zawrzemy w 1 bajcie i damy go zaraz po hashu! Więc nasz pakiet będzie wyglądał tak:
```
|--------------------------|
| 128 bit MD5 | 8 bit type |
|--------------------------|
|         Message          |
|--------------------------|
```
I ustalmy typy:
- `1` - wiadomość
- `2` - potwierdzenie

W przypadku innego typu uznamy wiadomość za błędną. A i jedna ważna sprawa, teraz przy liczeniu i weryfikacji hashu będziemy musieli uwzględnić nasz typ wiadomości. Zmodyfikujmy więc najpierw naszą klasę `WPSocket` dodając pola `sendQueue`, `lastSentRawPacket` oraz `timeoutTime`, który ustawimy na 1000ms:

```js
export class WPSocket {
    sendQueue = [];
    lastSentRawPacket = null;
    timeoutTime = 1000;
    // Reszta kodu
```

Utwórzmy sobie teraz obiekt pomocniczy `PacketType` wyglądający tak:
```js
const PacketType = {
    MSG: 1, // wiadomość
    ACK: 2  // potwierdzenie
}
```

i funkcję `createPacket`. Będzie ona przyjmowała typ pakietu i opcjonalną wiadomość, a zwróci nam bufor z gotowym do wysłania pakietem.
```js
function createPacket(type, message) {
    // Sprawdzenie czy typ jest poprawny
    if (!Object.values(PacketType).includes(type)) {
        throw new Error(`Type ${type} is not allowed!`);
    }
    const packetType = Buffer.alloc(1, type);

    switch (type) {
        case PacketType.ACK:
            return addHashToMessage(packetType);
        case PacketType.MSG:
            message = message ?? ""; // Jeżeli wiadomość jest nullem to damy pustego stringa.
            // Musimy zamienić wiadomość na bufor, czyli reprezetację bajtową.
            // Gdyż niżej operujemy na buforach
            if (!(message instanceof Buffer)) {
                message = Buffer.from(message);
            }

            const packet = Buffer.concat([packetType, message]);
            return addHashToMessage(packet);
    }
}
```
Teraz musimy wykorzystać tę funkcję w naszej metodzie `send`, która będzie dużo prostsza, ale tylko przez chwilę ;):
```js
send(msg, targetPort, targetAddress) {
    const packet = createPacket(PacketType.MSG, msg);
    this.internalSocket.send(packet, targetPort, targetAddress);
    this.lastSentRawPacket = packet;
}
```

Musimy teraz zmodyfikować funkcję `parsePacket`, żeby uwzględniała nasze nowe pole w pakiecie:
```js
function parsePacket(rawPacket) {
    if (rawPacket.length < 17) {
        return { valid: false }
    }
    const hash = rawPacket.subarray(0, 16);
    
    const restOfPacket = rawPacket.subarray(16);
    const type = restOfPacket.subarray(0, 1);
    const message = restOfPacket.subarray(1);

    return {
        message,
        type: type.readUint8(),
        valid: verifyPacket(hash, restOfPacket)
    }
}
```

Teraz można się zająć wysyłaniem potwierdzeń. Utwórzmy sobie metodę `sendAck` przyjmującą jako parametr adres i port na który wysłać potwierdzenie:
```js
sendAck(targetPort, targetAddress) {
    const packet = createPacket(PacketType.ACK);
    this.internalSocket.send(packet, targetPort, targetAddress);
    this.lastSentRawPacket = packet;
}
```
Mamy tutaj trochę powtarzającego się kodu, ale nie przejmujmy się tym na razie. Zrobimy za chwilę z tym porządek, obiecuję!

Musimy teraz zmodyfikować metodę `processMessage`, żeby wysyłała potwierdzenie w momencie otrzymania poprawnej wiadomości. Dodajemy na końcu metody `processMessage` po prostu taką linijkę:
```js
this.sendAck(rinfo.port, rinfo.address);
```

Teraz tylko zaimplementujmy ponowne wysyłanie wiadomości. Ale chwila, mamy powtarzający się kod, o którym wspomniałem wyżej. Naprawny to! Stwórzmy sobie metodę `sendPacket`, która będzie przyjmowała gotowy pakiet, dane adresowe oraz to czy pakiet powinien być wysyłany aż do otrzymania potwierdzenia. Dodajmy do niej ponowne wysyłanie pakietu co określony timeoutTime. Musimy dodatkowo dodać sobie funkcję, do której przypiszemy identyfikator naszego interwału. Następnie w metodach `send` oraz `sendAck` możemy wykorzystać metodę `sendPacket`. Więc dodajemy pole `interval` do naszej klasy:
```js
export class WPSocket {
    sendQueue = [];
    lastSentRawPacket = null;
    timeoutTime = 1000;
    interval = null;
    // Reszta kodu
```

I modyfikujemy nasze metody wysyłające:

```js
send(msg, targetPort, targetAddress) {
    const packet = createPacket(PacketType.MSG, msg);
    this.sendPacket(packet, targetPort, targetAddress, true);
}

sendAck(targetPort, targetAddress) {
    const packet = createPacket(PacketType.ACK, msg);
    this.sendPacket(packet, targetPort, targetAddress, false);
}

sendPacket(packet, targetPort, targetAddress, retryUntilAcknowledged) {
    this.internalSocket.send(packet, targetPort, targetAddress);
    this.lastSentRawPacket = packet;
    if (retryUntilAcknowledged) {
        this.interval = setInterval(() => {
            this.sendPacket(packet, targetPort, targetAddress);
        }, this.timeoutTime);
    }
}
```
To wymagać może trochę wyjaśnienia, atrybut `retryUntilAcknowledged` jest nam potrzebny aby zdecydować czy wysyłać ponownie wiadomość czy nie. Ma to znaczenie, gdyż chcemy ponownie wysyłać wiadomość w przypadku braku potwierdzenia, ale nie chcemy wysyłać ponownie potwierdzenia, bo kiedy mielibyśmy przestać? Otrzymując potwierdzenie potwierdzenia? I wtedy wysłać potwierdzenie potwierdzenia potwierdzenia? ;p

Została modyfikacja `processMessage`, tak, żeby w momencie otrzymania potwierdzenia interwał był czyszczony. No i warto by różnie reagować na różne typy pakietu:
```js
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
            console.warn(`Packet type ${packet.type} is not supported.`);
    }
}
```

Teraz możemy wszystko przetestować. Niestety jedyne co widzimy to:
```
RECEIVED INVALID PACKET!
RECEIVED INVALID PACKET!
RECEIVED INVALID PACKET!
```
Wyświetlane w nieskończoność, a poprawny pakiet nie chce nadejść. Tyle roboty, a dalej nie możemy przesłać poprawnego pakietu. Dlaczego?! Oto wyjaśnienie:

Nasz serwer ma 10% szans na zamianę każdego bajtu na losowy. To znaczy, że nasza szansa na powodzenie wynosi (0.9)^n, gdzie n jest rozmiarem naszego pakietu. Obecnie jest to rozmiar wiadomości + 17 bajtów. Oto kilka przykładów szansy na pomyślnie przesłanie wiadomości o różnych rozmiarach:
* 5 bajtów - 59%
* 10 bajtów - 35%
* 13 znaków, łącznie 30 bajtów - 4% szans na pomyślny transfer
* 100 znaków, łącznie 117 bajtów - 0.00044% szans na pomyślny transfer
* 50000 znaków, łącznie 50017 bajtów - (2.22 × 10^-2287)%, można rzec, że jest to niemożliwe

Na szczęście mamy pod ręką jeszcze kilka innych mechanizmów! A póki co nasza nadmiarowość wynosi 17 bajtów.

## Korekcja błędów - kodowanie Hamminga
Istnieją sposoby na korekcję błędów, które są w stanie naprawić błędy w informacji. Jednym z takich sposobów jest kodowanie Hamminga. Nie będę tutaj tłumaczył dokładnie czym jest kodowanie Hamminga, bo ten artykuł urósł by do potężnych rozmiarów, a i tak już jest długi. Na szczęście 3Blue1Brown ma genialne filmy na youtube właśnie o tym kodowaniu:
1. [How to send a self-correcting message (Hamming codes)](https://youtu.be/X8jsijhllIA)
2. [Hamming codes part 2, the elegance of it all](https://youtu.be/b3NxrZOu_CE)

Obejrzyj proszę je wszystkie zanim przystąpisz do dalszej implementacji naszego prokotołu, inaczej nie zrozumiesz o co w tym wszystkim chodzi. A tak w skrócie:  
Wyjaśnię to później, obejrzyj filmiki xD

Jeżeli masz już zrozumienie jak działa kodowanie Hamminga to utwórz plik `hamming.mjs` i wklej do niego tę implementację:

```js
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
```

Parę wyjaśnień do tego kodu:
### ***XOR*** (`^`) najpotężniejszą binarną operacją
Używam bardzo dużo tutaj operacji `xor`, przed wszystkim kodowanie Hamminga to wykorzystuje, a drugi powód użycia operacji `xor` to zamiania bitu. Jeżeli zrobimy `x xor 1`, gdzie x to 0 lub 1, to zamienimy wartość x z 0 na 1 albo odwrotnie. `1 xor 1 = 0`, `0 xor 1 = 1`.

### Przesunięcia bitowe, ***AND*** (`&`) oraz ***OR*** (`|`)
Za pomocą przesunięć bitowych oraz operatora binarnego `and` możemy "wyciągnąć" poszczególne bity z liczby. Powiedzmy, że mamy liczbę `11`, której binarna reprezentacja to `1011`. Wyciągnijmy teraz jej bity, za pomocą operacji binarnych
```
1011 & 1                 = 1
1011 >> 1 = 101, 101 & 1 = 1
101 >> 1 = 10, 10 & 1    = 0
10 >> 1 = 1, 1 & 1       = 1
```
I mamy bity naszej liczby w odwrotnej kolejności.

Druga sprawa to ustawianie bitów na odpowiednich pozycjach. Możemy to zrobić za pomocą operacji ***OR***. Powiedzmy, że chcemy ustawić bit `1` na pozycji `5`. Możemy wtedy zrobić `x &= 1 << 5`, zobaczmy:
```
1 << 5 = 10000
0000 0000 | 10000 = 0001 0000
                       ^
                    Bit na 5 pozycji
```

W ten sposób zrealizowaliśmy kodowanie Hamminga. Wykorzystajmy je teraz w naszym protokole! Importujemy funkcję z pliku `hamming.mjs`:
```js
import { hammingDecode, hammingEncode } from "./hamming.mjs";
```
A później modyfikujemy funkcję z tworzeniem i parsowaniem pakietu:

```js
function parsePacket(rawPacket) {
    if (rawPacket.length < 17) {
        return { valid: false }
    }

    const { decoded, valid: hammingValid } = hammingDecode(rawPacket);

    const hash = decoded.subarray(0, 16);
    
    const restOfPacket = decoded.subarray(16);
    const type = restOfPacket.subarray(0, 1);
    const message = restOfPacket.subarray(1);

    return {
        message,
        type: type.readUint8(),
        valid: hammingValid && verifyPacket(hash, restOfPacket)
    }
}

function createPacket(type, message) {
    // Sprawdzenie czy typ jest poprawny
    if (!Object.values(PacketType).includes(type)) {
        throw new Error(`Type ${type} is not allowed!`);
    }
    const packetType = Buffer.alloc(1, type);
    
    let packet;

    switch (type) {
        case PacketType.ACK:
            packet = addHashToMessage(packetType);
            break;
        case PacketType.MSG:
            message = message ?? ""; // Jeżeli wiadomość jest nullem to damy pustego stringa.
            // Musimy zamienić wiadomość na bufor, czyli reprezetację bajtową.
            // Gdyż niżej operujemy na buforach
            if (!(message instanceof Buffer)) {
                message = Buffer.from(message);
            }

            const payload = Buffer.concat([packetType, message]);
            packet = addHashToMessage(payload);
            break;
    }

    return hammingEncode(packet);
}
```

Możemy teraz przetestować znowu nasz kod i...  
Okazuje się, że dalej nie możemy przesłać wiadomości, dlaczego tak się dzieje?

Kod Hamminga jest w stanie naprawić jeden bit wiadomości, a my jak dostaniemy przekłamanie to całego bajtu. Z tym sobie kodowanie Hamminga nie poradzi. Możemy jednak ustawić w sprytny sposób bity, tak żeby kodowania Hamminga dało sobie z tym radę. I właśnie to zrobimy w następnej sekcji.

Ale teraz sprawdźmy jeszcze czy działa nasz kod dla poprawnej wiadomości bez zakłóceń. W tym celu znowu ustawmy prawdopodobieństwo zakłóceń serwera na 0, odpalmy wszystko ponownie i...
```
RECEIVED INVALID PACKET!
RECEIVED INVALID PACKET!
RECEIVED INVALID PACKET!
RECEIVED INVALID PACKET!
RECEIVED INVALID PACKET!
```
Dlaczego tak się dzieje? Dlatego że kodujemy wiadomość w blokach po 11 bajtów (popatrz komentarze w kodzie), a jak wiadomość nie jest wielokrotnością 11 bajtów to dodajemy do niej zera, aż będzie miała 11 bajtów, jednakże funkcja hashująca MD5 jest wyczulona na długość wiadomości. Moglibyśmy dodać długość przesyłanej wiadomości, ale możemy dodać to wydajniej. Po prostu dodajmy ile zakodowaliśmy nadmiarowych bajtów, które zignorujemy. Nasz pakiet przed zakodowaniem będzie wyglądał wtedy tak:
```
|--------------------------|
| 128 bit MD5 | 8 bit type |
|--------------------------|
|    8-bit Padding Size    |
|--------------------------|
|         Message          |
|--------------------------|
```
Pamiętajmy, żeby uwzględnić rozmiar paddingu do funkcji hashującej, czyli dodać `1` do rozmiaru pakietu:
```js
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
```

Teraz wiemy ile zignorować przy parsowaniu pakietu, więc zaimplementujmy to:
```js
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
```

Teraz przy sprawdzeniu wszystko powinno działać, ustaw zakłócenia serwera do poprzedniego poziomu, na 0.1.

## Odpowiednie ustawienie bitów
