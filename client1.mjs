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