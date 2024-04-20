const { sittingSequence } = require("./connectionController");

const cardSuits = ['diamonds', 'clubs', 'hearts', 'spades'];
const cardValues = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];

function shuffleCard (){
    let cards = getShuffledCardsDeck();
    let distributedCards = [cards.slice(0,13), cards.slice(13,26), cards.slice(26,39), cards.slice(39,52)];
    let roomId = socket.data.roomId;
    const roomClients = socketio.sockets.adapter.rooms.get(roomId) || new Set();

    for (const clientId of roomClients ) {
        //this is the socket of each client in the room.
        const clientSocket = socketio.sockets.sockets.get(clientId);

        clientOrientation = clientSocket.data.orientation;
        orientationIndex = sittingSequence.indexOf(clientOrientation);
        assignedCardsToClients = distributedCards[orientationIndex];

        // distributing cards to clients based on orientation
        clientSocket.emit('distribute_cards', assignedCardsToClients);
    }
}


/**
 * 
 * @returns array of 52 random cards
 */
function getShuffledCardsDeck(){
    let res = []; 
        
    for (let type of cardSuits) {
        for (let value of cardValues) {
            res.push({cardType: type, cardValue: value});
        } 
    } 
        
    for (let i = res.length - 1; i > 0; i--) { 
        let j = Math.floor(Math.random() * (i + 1)); 
        [res[i], res[j]] = [res[j], res[i]]; 
    }

    return wellDistributedDeck(res) ? res : getShuffledCardsDeck(); // checks for face card distribution
}

/**
 * 
 * @param cards 52 cards deck
 * @returns if 4 set of 13 cards all have face cards
 */
function wellDistributedDeck(cards){
    if(cards.length != 52) {
        console.log('Full 52 cards deck is not provided');
        return;
    }
    return checkFaceCard(cards.slice(0,13)) && checkFaceCard(cards.slice(13,26)) && checkFaceCard(cards.slice(26,39)) && checkFaceCard(cards.slice(39,52))
}

/**
 * 
 * @returns boolean -> if given cards contain any face card
 */
function checkFaceCard(cards){
    let faceCards = cards.filter(card=> cardValues.slice(9,13).includes(card.cardValue));
    return faceCards.length > 0;
}

module.exports = { shuffleCard };