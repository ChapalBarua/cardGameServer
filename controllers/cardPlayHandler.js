module.exports = (io, getTables, updateTables)=>{
    const cardSuits = ['diamonds', 'clubs', 'hearts', 'spades'];
    const cardValues = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];
    const NextPlayer = { // helper object to decide who will play next
        one: 'two',
        two: 'three',
        three: 'four',
        four: 'one'
    };

    const inactivePlayer = { // helper object to decide who will show card based on who set color
        one: 'three',
        two: 'four',
        three: 'one',
        four: 'two'
    };

    const shuffleCard = async function(){
        const socket = this;
        let cards = getShuffledCardsDeck();
        let distributedCards = [cards.slice(0,13), cards.slice(13,26), cards.slice(26,39), cards.slice(39,52)];
        let roomId = socket.data.roomId;
        let tables = getTables();
        const roomClients = io.sockets.adapter.rooms.get(roomId) || new Set();
        let roomTable = tables.find(table=>table.roomId===roomId);
        let index = 0;
        for (const clientId of roomClients) {
            // getting all the sockets/players in the room
            const clientSocket = io.sockets.sockets.get(clientId);
            socketSerial = clientSocket.data.serial;

            // sending the shuffled cards to individual player
            assignedCardsToClients = distributedCards[index];
            clientSocket.emit('distribute_cards', assignedCardsToClients);

            // keeping records of distributed card in table
            roomTable.cards[socketSerial] = assignedCardsToClients;
            index++;
        }
        updateTables(tables);
    };

    

    // take actions after a call is decided- puts info in table and broadcast next player
    const onCallDecided = async function(decidedCall){
        const socket = this;
        roomId = socket.data.roomId;
        let tables = getTables();
        let roomTable = tables.find(table=>table.roomId===roomId);
        roomTable.whoSetColor = decidedCall.personCalled;
        roomTable.currentCall = decidedCall.call;
        roomTable.currentSetColor = decidedCall.color;
        roomTable.whoShowCards = inactivePlayer[decidedCall.personCalled];
        roomTable.whoPlayNext = NextPlayer[ decidedCall.personCalled];
        roomTable.currentRound++;

        updateTables(tables);

        // emits who will play and which cards will play
        io.to(roomId).emit("next_player", {
            nextPlayer: NextPlayer[decidedCall.personCalled], 
            nextCards: NextPlayer[decidedCall.personCalled]
        });
    };

    // notifies everyone when a player plays a card
    const playCardHandler = async function(playedCard){
        const socket = this;
        roomId = socket.data.roomId;
        let tables = getTables();
        let roomTable = tables.find(table=>table.roomId===roomId);
        roomTable.cardsOnTable.push(playedCard);

        roomTable.cards[playedCard.serial] = roomTable.cards[playedCard.serial].filter(
            card=> card.cardType != playedCard.card.cardType || card.cardValue!= playedCard.card.cardValue)

        if(roomTable.cardsOnTable.length!=4){ // if more cards will be played in current round - decide who plays next - show cards on condition

            // decide who will play next
            let nextPlayer = NextPlayer[playedCard.serial];
            let nextCards = NextPlayer[playedCard.serial]; //serial
            // condition to hand over control to partner if card shown
            if(nextPlayer===roomTable.whoShowCards){
                nextPlayer = inactivePlayer[nextPlayer];
            }

            roomTable.whoPlayNext = nextPlayer;

            // first round - after first card play -cards will be shown
            if(roomTable.currentRound===1 && roomTable.cardsOnTable.length ===1){
                let shownCards = {
                    serial: nextCards,
                    cards: roomTable.cards[nextCards]
                }
                roomTable.cardShown = true;
                io.to(roomId).emit("show_cards", shownCards);
            }
            
            // attach info about next player with played card if round not complete
            playedCard['next'] = {
                nextPlayer: nextPlayer,
                nextCards: nextCards
            }
        }
        updateTables(tables);
        io.to(roomId).emit("played_card", playedCard);
    };


    // notifies everyone when a player unplays a card
    const unplayCardHandler = async function(unplayedCard){
        const socket = this;
        roomId = socket.data.roomId;
        let tables = getTables();
        let roomTable = tables.find(table=>table.roomId===roomId);
        roomTable.cardsOnTable.pop();
        roomTable.cards[unplayedCard.serial].push(unplayedCard.card);
        roomTable.whoPlayNext = unplayedCard.playedBy;
        updateTables(tables);
        io.to(roomId).emit("unplayed_card", unplayedCard);
    };

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
    };

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
    };

    /**
     * 
     * @returns boolean -> if given cards contain any face card
     */
    function checkFaceCard(cards){
        let faceCards = cards.filter(card=> cardValues.slice(9,13).includes(card.cardValue));
        return faceCards.length > 0;
    };

    return { shuffleCard, playCardHandler, unplayCardHandler, onCallDecided };
}