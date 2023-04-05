# Worst Protocol Ever
> PL only, sorry

Moja dziewczyna dostała takie zadanko na studiach:

Mamy dwóch klientów oraz serwer, komunikują się po UDP. Klient 1 wysyła wiadomość do serwera, a serwer przesyła ją do klienta 2. Serwer działa w trybie zakłóceń, ma 10% szans na zamienienie każdego bajtu wiadomości na losowy przed przesłaniem dalej.  
```mermaid
flowchart LR
    A[Klient 1]-->B[Serwer]-->|Możliwie uszkodzona wiadomość|C[Klient 2]
```

Wykorzystując różne techniki, takie jak:
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
