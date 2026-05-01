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

    const bidColorRank = {
        clubs: 0,
        diamonds: 1,
        hearts: 2,
        spades: 3,
        nt: 4
    };

    const gamePointValue = {
        clubs: 6,
        diamonds: 7,
        hearts: 8,
        spades: 9,
        nt: 10
    };

    const shuffleCard = async function(){
        const socket = this;
        let roomId = socket.data.roomId;
        let tables = getTables();
        let roomTable = tables.find(table=>table.roomId===roomId);
        if(!roomTable){
            return;
        }

        distributeCardsToRoom(roomId, roomTable);
        updateTables(tables);

        emitBiddingState(roomId, roomTable);
    };

    

    // handle sequential bidding until the highest bid is finalized
    const onCallDecided = async function(decidedCall){
        const socket = this;
        const roomId = socket.data.roomId;
        let tables = getTables();
        let roomTable = tables.find(table=>table.roomId===roomId);
        if(!roomTable){
            return;
        }

        const bidder = socket.data.serial;
        if(roomTable.biddingActivePlayer !== bidder){
            emitInvalidBid(socket, "It is not your turn to bid.");
            return;
        }

        if(decidedCall.pass){
            roomTable.biddingDisplay[bidder] = 'Pass';
            roomTable.biddingPasses++;

            if(!roomTable.biddingHighestBid && roomTable.biddingPasses >= 4){
                applyPassOutPenalty(roomTable, bidder);
                io.to(roomId).emit("bidding_passed_out", {
                    penalizedBidder: bidder,
                    message: `${roomTable.players[bidder]} passed out the hand. Team penalized -50. Redealing.`
                });
                distributeCardsToRoom(roomId, roomTable);
                updateTables(tables);
                io.to(roomId).emit("update_points", roomTable.currentPoints);
                emitBiddingState(roomId, roomTable);
                return;
            }

            if(roomTable.biddingHighestBid && roomTable.biddingPasses >= 3){
                finalizeBid(roomId, roomTable);
                updateTables(tables);
                return;
            }
        }else {
            const proposedBid = {
                call: decidedCall.call,
                color: decidedCall.color,
                personCalled: bidder
            };

            if(!isHigherBid(proposedBid, roomTable.biddingHighestBid)){
                emitInvalidBid(socket, "Your bid must be higher than the current highest bid.");
                return;
            }

            roomTable.biddingHighestBid = proposedBid;
            roomTable.biddingDisplay[bidder] = formatBid(proposedBid);
            roomTable.biddingHistory.push(proposedBid);
            roomTable.biddingPasses = 0;
        }

        roomTable.biddingActivePlayer = NextPlayer[bidder];
        updateTables(tables);
        emitBiddingState(roomId, roomTable);
    };

    // notifies everyone when a player plays a card
    const playCardHandler = async function(playedCard){
        const socket = this;
        roomId = socket.data.roomId;
        let tables = getTables();
        let roomTable = tables.find(table=>table.roomId===roomId);

        if(!roomTable || !isValidPlay(socket, roomTable, playedCard)){
            return;
        }

        roomTable.cardsOnTable.push(playedCard);

        roomTable.cards[playedCard.serial] = roomTable.cards[playedCard.serial].filter(
            card=> card.cardType != playedCard.card.cardType || card.cardValue!= playedCard.card.cardValue)
        if(!roomTable.setColorBroken && playedCard.card.cardType === roomTable.currentSetColor){
            roomTable.setColorBroken = true;
        }

        if(roomTable.cardsOnTable.length!=4){ // if more cards will be played in current round - decide who plays next - show cards on condition

            // decide who will play next
            let nextPlayer = NextPlayer[playedCard.serial];
            let nextCards = NextPlayer[playedCard.serial]; //serial
            // condition to hand over control to partner if card shown
            if(nextPlayer===roomTable.whoShowCards){
                nextPlayer = inactivePlayer[nextPlayer];
            }

            roomTable.whoPlayNext = nextPlayer;

            // show the caller's partner hand after the first accepted play of the game
            if(!roomTable.cardShown && roomTable.cardsOnTable.length ===1){
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
    // perform actions when a round is complete
    const onRoundComplete = async function(){
        const socket = this;
        let roomId = socket.data.roomId;
        let tables = getTables();
        let roomTable = tables.find(table=>table.roomId===roomId);

        // decide winner card
        // if color played - then highest color card

        let currentColor = roomTable.currentSetColor;

        let playedCurrentColorCards = roomTable.cardsOnTable.filter(playedCard=>playedCard.card.cardType===currentColor);

        let winnerCard;

        // if current color is played
        if(playedCurrentColorCards.length>0){
            winnerCard = playedCurrentColorCards.sort((card1, card2)=>
                getValue(card2.card.cardValue) - getValue(card1.card.cardValue))[0];
        }else { // if current color is not played then first card color is set color for the round
            let modifiedColor = roomTable.cardsOnTable[0].card.cardType;
            let modifiedColorCards = roomTable.cardsOnTable.filter(playedCard=>playedCard.card.cardType===modifiedColor);
            winnerCard = modifiedColorCards.sort((card1, card2)=>
                getValue(card2.card.cardValue) - getValue(card1.card.cardValue))[0];
        }
        // winnerCard.serial is the winner

        if(winnerCard.serial === 'one' || winnerCard.serial === 'three'){
            roomTable.currentPoints.setsTakenByTeam1++;
        }else {
            roomTable.currentPoints.setsTakenByTeam2++;
        }

        let nextPlayer = winnerCard.serial;
        let nextCards = winnerCard.serial;

        if(nextPlayer===roomTable.whoShowCards){
            nextPlayer = inactivePlayer[nextPlayer];
        }
        roomTable.cardHistory.push(roomTable.cardsOnTable);
        roomTable.cardsOnTable = [];
        roomTable.whoPlayNext = nextPlayer;

        if(roomTable.currentRound===13){
            const scoringSummary = settleCompletedGame(roomTable);
            updateTables(tables);
            io.to(roomId).emit("game_scored", scoringSummary);
            io.to(roomId).emit("can_shuffle", true);
            io.to(roomId).emit("update_points", roomTable.currentPoints);
            return;
        }

        io.to(roomId).emit("update_points",roomTable.currentPoints);

        roomTable.currentRound++;
        updateTables(tables);

        io.to(roomId).emit("next_player", {
            nextPlayer, 
            nextCards,
            clearTable: roomTable.currentPoints // asks client to clear table as round is complete
        });

        
    }

    const onGameCompleted = async function(pointsUpdate){
        const socket = this;
        let roomId = socket.data.roomId;
        let tables = getTables();
        let roomTable = tables.find(table=>table.roomId===roomId);

        let currentPoints = roomTable.currentPoints;
        currentPoints.team1 +=  pointsUpdate.team1;
        currentPoints.team2 +=  pointsUpdate.team2;
        currentPoints.setsTakenByTeam1 = 0;
        currentPoints.setsTakenByTeam2 = 0;
        currentPoints.activeGamesByTeam1 += pointsUpdate.activeGamesByTeam1;
        currentPoints.activeGamesByTeam2 += pointsUpdate.activeGamesByTeam2;

        if(currentPoints.activeGamesByTeam1===2){
            currentPoints.activeGamesByTeam1=0;
            currentPoints.activeGamesByTeam2=0;
            currentPoints.team1 +=250;
        }

        if(currentPoints.activeGamesByTeam2===2){
            currentPoints.activeGamesByTeam1=0;
            currentPoints.activeGamesByTeam2=0;
            currentPoints.team2 +=250;
        }

        roomTable.cards = getBlankHands();

        roomTable.cardShown = false;
        roomTable.currentRound = 0;
        roomTable.completedGame++;
        roomTable.currentSetColor = '';
        roomTable.setColorBroken = false;
        roomTable.biddingActivePlayer = getOpeningBidder(roomTable.completedGame);
        roomTable.biddingHighestBid = null;
        roomTable.biddingPasses = 0;
        roomTable.biddingDisplay = {
            one: '',
            two: '',
            three: '',
            four: ''
        };
        roomTable.biddingHistory = [];
        roomTable.whoSetColor = '';
        roomTable.whoShowCards ='';
        roomTable.currentCall = 0;
        roomTable.whoPlayNext = '';
        roomTable.cardHistory = [];
        roomTable.honorsPointsForHand = { team1: 0, team2: 0 };
        updateTables(tables);
        io.to(roomId).emit("can_shuffle", true);
        io.to(roomId).emit("update_points",roomTable.currentPoints);
    }


    /**
     * returns a card value based on string value
     */
    function getValue(playedCardvalue){
        return cardValues.findIndex(value=>value===playedCardvalue);
    }

    function getBlankHands(){
        return {
            one: [],
            two: [],
            three: [],
            four: []
        };
    }

    function hasCard(cards, targetCard){
        return cards.some(card=>
            card.cardType === targetCard.cardType && card.cardValue === targetCard.cardValue);
    }

    function hasSuit(cards, cardType){
        return cards.some(card=>card.cardType === cardType);
    }

    function onlyHasSuit(cards, cardType){
        return cards.length > 0 && cards.every(card=>card.cardType === cardType);
    }

    function emitInvalidPlay(socket, reason){
        socket.emit("invalid_card_play", { reason });
    }

    function emitInvalidBid(socket, reason){
        socket.emit("invalid_bid", { reason });
    }

    function getOpeningBidder(completedGame){
        return ['one', 'two', 'three', 'four'][completedGame % 4];
    }

    function resetBiddingState(roomTable){
        roomTable.cardShown = false;
        roomTable.currentRound = 0;
        roomTable.currentSetColor = '';
        roomTable.setColorBroken = false;
        roomTable.whoSetColor = '';
        roomTable.whoShowCards = '';
        roomTable.currentCall = 0;
        roomTable.whoPlayNext = '';
        roomTable.cardHistory = [];
        roomTable.biddingActivePlayer = getOpeningBidder(roomTable.completedGame);
        roomTable.biddingHighestBid = null;
        roomTable.biddingPasses = 0;
        roomTable.biddingDisplay = {
            one: '',
            two: '',
            three: '',
            four: ''
        };
        roomTable.biddingHistory = [];
        roomTable.honorsPointsForHand = { team1: 0, team2: 0 };
    }

    function distributeCardsToRoom(roomId, roomTable){
        const cards = getShuffledCardsDeck();
        const distributedCards = [cards.slice(0,13), cards.slice(13,26), cards.slice(26,39), cards.slice(39,52)];
        const roomClients = io.sockets.adapter.rooms.get(roomId) || new Set();
        let index = 0;

        resetBiddingState(roomTable);

        for (const clientId of roomClients) {
            const clientSocket = io.sockets.sockets.get(clientId);
            socketSerial = clientSocket.data.serial;
            assignedCardsToClients = distributedCards[index];
            clientSocket.emit('distribute_cards', assignedCardsToClients);
            roomTable.cards[socketSerial] = assignedCardsToClients;
            index++;
        }
    }

    function applyPassOutPenalty(roomTable, bidder){
        if(bidder === 'one' || bidder === 'three'){
            roomTable.currentPoints.team1 -= 50;
        }else {
            roomTable.currentPoints.team2 -= 50;
        }
    }

    function isTeamOne(serial){
        return serial === 'one' || serial === 'three';
    }

    function getCallerTricks(roomTable){
        return isTeamOne(roomTable.whoSetColor)
            ? roomTable.currentPoints.setsTakenByTeam1
            : roomTable.currentPoints.setsTakenByTeam2;
    }

    function countMatchingCards(cards, matcher){
        return cards.filter(matcher).length;
    }

    function buildCounts(cardsByPlayer, matcher){
        return {
            one: countMatchingCards(cardsByPlayer.one, matcher),
            two: countMatchingCards(cardsByPlayer.two, matcher),
            three: countMatchingCards(cardsByPlayer.three, matcher),
            four: countMatchingCards(cardsByPlayer.four, matcher)
        };
    }

    function getHighestCountSerial(counts){
        return Object.keys(counts).reduce((bestSerial, currentSerial)=>
            counts[currentSerial] > counts[bestSerial] ? currentSerial : bestSerial
        );
    }

    function getPartnerSerial(serial){
        return {
            one: 'three',
            two: 'four',
            three: 'one',
            four: 'two'
        }[serial];
    }

    function getTeamTotals(counts){
        return {
            team1: counts.one + counts.three,
            team2: counts.two + counts.four
        };
    }

    function getHonorsPoints(cardsByPlayer, setColor){
        if(setColor === 'nt'){
            const aceCounts = buildCounts(cardsByPlayer, card=>card.cardValue === 'ace');

            const maxAceHolder = Math.max(...Object.values(aceCounts));
            if(maxAceHolder === 4){
                return isTeamOne(getHighestCountSerial(aceCounts)) ? { team1: 100, team2: 0 } : { team1: 0, team2: 100};
            }

            const teamTotals = getTeamTotals(aceCounts);

            if(teamTotals.team1 === teamTotals.team2){
                return { team1: 0, team2: 0 };
            }

            return teamTotals.team1 > teamTotals.team2
                ? { team1: teamTotals.team1 * 10, team2: 0 }
                : { team1: 0, team2: teamTotals.team2 * 10 };
        }

        const honorValues = new Set(['ace', 'king', 'queen', 'jack', '10']);
        const honorCounts = buildCounts(cardsByPlayer, card=>card.cardType === setColor && honorValues.has(card.cardValue));

        const maxHonorHolder = Math.max(...Object.values(honorCounts));
        if(maxHonorHolder === 5){
            return isTeamOne(getHighestCountSerial(honorCounts)) ? { team1: 100, team2: 0 } : { team1: 0, team2: 100 };
        }

        if(maxHonorHolder === 4){
            const fourHonorHolder = getHighestCountSerial(honorCounts);
            const fourHonorTeamIsOne = isTeamOne(fourHonorHolder);
            const partnerSerial = getPartnerSerial(fourHonorHolder);
            const partnerHonors = honorCounts[partnerSerial];
            const points = 80 + (partnerHonors * 10);

            return fourHonorTeamIsOne ? { team1: points, team2: 0 } : { team1: 0, team2: points };
        }

        const teamTotals = getTeamTotals(honorCounts);

        if(teamTotals.team1 === teamTotals.team2){
            return { team1: 0, team2: 0 };
        }

        return teamTotals.team1 > teamTotals.team2
            ? { team1: teamTotals.team1 * 10, team2: 0 }
            : { team1: 0, team2: teamTotals.team2 * 10 };
    }

    function getGamePoints(roomTable){
        const callerTricks = getCallerTricks(roomTable);
        const expectedTricks = 6 + roomTable.currentCall;

        if(callerTricks < expectedTricks){
            const penalty = -50 * (expectedTricks - callerTricks);
            return isTeamOne(roomTable.whoSetColor)
                ? { team1: penalty, team2: 0 }
                : { team1: 0, team2: penalty };
        }

        const points = (callerTricks - 6) * gamePointValue[roomTable.currentSetColor];
        return isTeamOne(roomTable.whoSetColor)
            ? { team1: points, team2: 0 }
            : { team1: 0, team2: points };
    }

    function settleCompletedGame(roomTable){
        const honorsPoints = roomTable.honorsPointsForHand || { team1: 0, team2: 0 };
        const gamePoints = getGamePoints(roomTable);
        const callerIsTeamOne = isTeamOne(roomTable.whoSetColor);
        const scoringSummary = {
            honorsPoints,
            gamePoints,
            message: buildGameScoringMessage(roomTable, honorsPoints, gamePoints)
        };

        roomTable.currentPoints.team1 += honorsPoints.team1 + gamePoints.team1;
        roomTable.currentPoints.team2 += honorsPoints.team2 + gamePoints.team2;

        const callerTricks = getCallerTricks(roomTable);
        const expectedTricks = 6 + roomTable.currentCall;
        if(callerTricks >= expectedTricks && callerTricks >= 12){
            const bonusPoints = (callerTricks - 11) * 50;
            if(callerIsTeamOne){
                roomTable.currentPoints.team1 += bonusPoints;
            }else {
                roomTable.currentPoints.team2 += bonusPoints;
            }
            io.to(roomTable.roomId).emit(
                "bonus_notification",
                bonusPoints === 50 ? 'LS bonus! +50 points.' : 'GS bonus! +100 points.'
            );
        }

        if(callerIsTeamOne && gamePoints.team1 > 30){
            roomTable.currentPoints.activeGamesByTeam1++;
        }

        if(!callerIsTeamOne && gamePoints.team2 > 30){
            roomTable.currentPoints.activeGamesByTeam2++;
        }

        if(roomTable.currentPoints.activeGamesByTeam1 >= 2 || roomTable.currentPoints.activeGamesByTeam2 >= 2){
            const team1WonRub = roomTable.currentPoints.activeGamesByTeam1 >= 2;
            roomTable.currentPoints.activeGamesByTeam1 = 0;
            roomTable.currentPoints.activeGamesByTeam2 = 0;

            if(team1WonRub){
                roomTable.currentPoints.team1 += 250;
            }else {
                roomTable.currentPoints.team2 += 250;
            }

            io.to(roomTable.roomId).emit("bonus_notification", 'Congrats on your RUB! +250 points.');
        }
        roomTable.currentPoints.setsTakenByTeam1 = 0;
        roomTable.currentPoints.setsTakenByTeam2 = 0;
        roomTable.cards = getBlankHands();
        roomTable.cardShown = false;
        roomTable.currentRound = 0;
        roomTable.completedGame++;
        roomTable.currentSetColor = '';
        roomTable.setColorBroken = false;
        roomTable.biddingActivePlayer = getOpeningBidder(roomTable.completedGame);
        roomTable.biddingHighestBid = null;
        roomTable.biddingPasses = 0;
        roomTable.biddingDisplay = {
            one: '',
            two: '',
            three: '',
            four: ''
        };
        roomTable.biddingHistory = [];
        roomTable.whoSetColor = '';
        roomTable.whoShowCards = '';
        roomTable.currentCall = 0;
        roomTable.whoPlayNext = '';
        roomTable.cardHistory = [];
        roomTable.honorsPointsForHand = { team1: 0, team2: 0 };
        return scoringSummary;
    }

    function buildGameScoringMessage(roomTable, honorsPoints, gamePoints){
        const honorsMessage = honorsPoints.team1
            ? `Team 1 honors +${honorsPoints.team1}`
            : honorsPoints.team2
                ? `Team 2 honors +${honorsPoints.team2}`
                : 'No honors points';

        const gameMessage = gamePoints.team1
            ? `Team 1 game points ${formatSignedPoints(gamePoints.team1)}`
            : gamePoints.team2
                ? `Team 2 game points ${formatSignedPoints(gamePoints.team2)}`
                : 'No game points';

        return `${honorsMessage}. ${gameMessage}.`;
    }

    function formatSignedPoints(points){
        return points > 0 ? `+${points}` : `${points}`;
    }

    function isHigherBid(proposedBid, currentBid){
        if(
            !Number.isInteger(proposedBid.call) ||
            proposedBid.call < 1 ||
            proposedBid.call > 7 ||
            bidColorRank[proposedBid.color] === undefined
        ){
            return false;
        }

        if(!currentBid){
            return true;
        }

        return proposedBid.call > currentBid.call ||
            (proposedBid.call === currentBid.call && bidColorRank[proposedBid.color] > bidColorRank[currentBid.color]);
    }

    function formatBid(bid){
        if(!bid){
            return 'No bid yet';
        }

        const bidLabels = {
            clubs: 'C',
            diamonds: 'D',
            hearts: 'H',
            spades: 'S',
            nt: 'NT'
        };

        return `${bid.call}${bidLabels[bid.color]}`;
    }

    function emitBiddingState(roomId, roomTable){
        io.to(roomId).emit("bidding_state", {
            nextBidder: roomTable.biddingActivePlayer,
            highestBid: roomTable.biddingHighestBid,
            consecutivePasses: roomTable.biddingPasses,
            canPass: Boolean(roomTable.biddingHighestBid),
            playerBids: roomTable.biddingDisplay
        });
        io.to(roomId).emit("standing_call", formatBid(roomTable.biddingHighestBid));
    }

    function finalizeBid(roomId, roomTable){
        const winningBid = roomTable.biddingHighestBid;
        if(!winningBid){
            return;
        }

        const declarer = getDeclarer(roomTable, winningBid);

        roomTable.whoSetColor = declarer;
        roomTable.currentCall = winningBid.call;
        roomTable.currentSetColor = winningBid.color;
        roomTable.honorsPointsForHand = getHonorsPoints(roomTable.cards, winningBid.color);
        roomTable.setColorBroken = false;
        roomTable.whoShowCards = inactivePlayer[declarer];
        roomTable.whoPlayNext = NextPlayer[declarer];
        roomTable.currentRound++;
        roomTable.biddingActivePlayer = '';
        roomTable.biddingPasses = 0;
        roomTable.biddingDisplay = {
            one: '',
            two: '',
            three: '',
            four: ''
        };
        roomTable.biddingHistory = [];

        io.to(roomId).emit("bidding_state", null);
        io.to(roomId).emit("standing_call", formatBid(winningBid));
        io.to(roomId).emit("next_player", {
            nextPlayer: NextPlayer[declarer],
            nextCards: NextPlayer[declarer],
            points: roomTable.currentPoints
        });
    }

    function getDeclarer(roomTable, winningBid){
        const winningTeamIsOne = isTeamOne(winningBid.personCalled);
        const firstMatchingBid = (roomTable.biddingHistory || []).find((bid)=>
            bid.color === winningBid.color &&
            isTeamOne(bid.personCalled) === winningTeamIsOne
        );

        return firstMatchingBid?.personCalled || winningBid.personCalled;
    }

    function canControlHand(roomTable, playedBy, serial){
        if(playedBy === serial){
            return true;
        }

        return playedBy === roomTable.whoSetColor && serial === roomTable.whoShowCards;
    }

    function isValidPlay(socket, roomTable, playedCard){
        if(socket.data.serial !== playedCard.playedBy){
            emitInvalidPlay(socket, "You cannot play on behalf of another player.");
            return false;
        }

        if(roomTable.cardsOnTable.length >= 4){
            emitInvalidPlay(socket, "Please wait for the current trick to complete.");
            return false;
        }

        if(roomTable.whoPlayNext && roomTable.whoPlayNext !== playedCard.playedBy){
            emitInvalidPlay(socket, "It is not your turn.");
            return false;
        }

        if(!canControlHand(roomTable, playedCard.playedBy, playedCard.serial)){
            emitInvalidPlay(socket, "You cannot play that hand right now.");
            return false;
        }

        const playerCards = roomTable.cards[playedCard.serial] || [];
        if(!hasCard(playerCards, playedCard.card)){
            emitInvalidPlay(socket, "That card is not in your hand.");
            return false;
        }

        if(roomTable.cardsOnTable.length === 0){
            if(
                roomTable.currentSetColor &&
                playedCard.card.cardType === roomTable.currentSetColor &&
                !roomTable.setColorBroken &&
                !onlyHasSuit(playerCards, roomTable.currentSetColor)
            ){
                emitInvalidPlay(socket, "You cannot play the set color until it is broken or unless your hand only has set color left.");
                return false;
            }

            return true;
        }

        const leadCardType = roomTable.cardsOnTable[0].card.cardType;
        if(hasSuit(playerCards, leadCardType) && playedCard.card.cardType !== leadCardType){
            emitInvalidPlay(socket, "You must follow the lead suit if you had it at the start of the trick.");
            return false;
        }

        return true;
    }

    function computeSetColorBroken(roomTable){
        if(!roomTable.currentSetColor){
            return false;
        }

        return [...roomTable.cardHistory, roomTable.cardsOnTable].some(trick=>
            trick.some(playedCard=>playedCard.card.cardType === roomTable.currentSetColor));
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

    return { shuffleCard, playCardHandler, onCallDecided, onRoundComplete, onGameCompleted };
}
