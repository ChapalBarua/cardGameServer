const test = require('node:test');
const assert = require('node:assert/strict');

const createCardPlayHandlers = require('../controllers/cardPlayHandler');

function createIoRecorder() {
  const emissions = [];

  return {
    emissions,
    to(roomId) {
      return {
        emit(event, payload) {
          emissions.push({ roomId, event, payload });
        }
      };
    },
    sockets: {
      adapter: {
        rooms: new Map()
      },
      sockets: new Map()
    }
  };
}

function createRoomTable(overrides = {}) {
  return {
    roomId: 'room-1',
    cards: {
      one: [],
      two: [],
      three: [],
      four: []
    },
    players: {
      one: 'Player One',
      two: 'Player Two',
      three: 'Player Three',
      four: 'Player Four'
    },
    cardsOnTable: [],
    cardShown: false,
    currentRound: 0,
    completedGame: 0,
    currentSetColor: '',
    setColorBroken: false,
    biddingActivePlayer: 'one',
    biddingHighestBid: null,
    biddingPasses: 0,
    biddingDisplay: {
      one: '',
      two: '',
      three: '',
      four: ''
    },
    biddingHistory: [],
    whoSetColor: '',
    whoShowCards: '',
    currentCall: 0,
    whoPlayNext: '',
    usersOnTable: 4,
    currentPoints: {
      team1: 0,
      team2: 0,
      setsTakenByTeam1: 0,
      setsTakenByTeam2: 0,
      activeGamesByTeam1: 0,
      activeGamesByTeam2: 0
    },
    honorsPointsForHand: {
      team1: 0,
      team2: 0
    },
    cardHistory: [],
    ...overrides
  };
}

function createHarness(roomTable) {
  const io = createIoRecorder();
  const tables = [roomTable];
  let lastUpdatedTables = tables;
  const handlers = createCardPlayHandlers(io, () => tables, updated => {
    lastUpdatedTables = updated;
  });

  return { io, handlers, getLastUpdatedTables: () => lastUpdatedTables };
}

test('round 13 scores 3NT down three as -150 and emits one final update_points', async () => {
  const roomTable = createRoomTable({
    currentRound: 13,
    currentSetColor: 'nt',
    currentCall: 3,
    whoSetColor: 'two',
    currentPoints: {
      team1: 0,
      team2: 0,
      setsTakenByTeam1: 7,
      setsTakenByTeam2: 5,
      activeGamesByTeam1: 0,
      activeGamesByTeam2: 0
    },
    cardsOnTable: [
      { serial: 'two', playedBy: 'two', card: { cardType: 'hearts', cardValue: 'ace' } },
      { serial: 'three', playedBy: 'three', card: { cardType: 'hearts', cardValue: 'king' } },
      { serial: 'four', playedBy: 'four', card: { cardType: 'hearts', cardValue: 'queen' } },
      { serial: 'one', playedBy: 'one', card: { cardType: 'hearts', cardValue: 'jack' } }
    ]
  });

  const { io, handlers, getLastUpdatedTables } = createHarness(roomTable);
  const socket = { data: { roomId: roomTable.roomId } };

  await handlers.onRoundComplete.call(socket);

  assert.equal(roomTable.currentPoints.team1, 0);
  assert.equal(roomTable.currentPoints.team2, -150);
  assert.equal(roomTable.currentPoints.setsTakenByTeam1, 0);
  assert.equal(roomTable.currentPoints.setsTakenByTeam2, 0);
  assert.equal(roomTable.currentRound, 0);
  assert.equal(roomTable.completedGame, 1);

  const updatePointEvents = io.emissions.filter(event => event.event === 'update_points');
  assert.equal(updatePointEvents.length, 1);
  assert.deepEqual(updatePointEvents[0].payload, roomTable.currentPoints);

  const scoredEvent = io.emissions.find(event => event.event === 'game_scored');
  assert.ok(scoredEvent);
  assert.equal(scoredEvent.payload.gamePoints.team2, -150);
  assert.deepEqual(getLastUpdatedTables()[0].currentPoints, roomTable.currentPoints);
});

test('finalized 4C hand scores +90 honors and +24 game for an exact make', async () => {
  const roomTable = createRoomTable({
    cards: {
      one: [
        { cardType: 'clubs', cardValue: 'ace' },
        { cardType: 'clubs', cardValue: 'king' },
        { cardType: 'clubs', cardValue: 'queen' },
        { cardType: 'clubs', cardValue: 'jack' }
      ],
      two: [],
      three: [
        { cardType: 'clubs', cardValue: '10' }
      ],
      four: []
    },
    biddingActivePlayer: 'four',
    biddingHighestBid: { call: 4, color: 'clubs', personCalled: 'one' },
    biddingPasses: 2,
    biddingHistory: [{ call: 4, color: 'clubs', personCalled: 'one' }],
    currentPoints: {
      team1: 0,
      team2: 0,
      setsTakenByTeam1: 0,
      setsTakenByTeam2: 0,
      activeGamesByTeam1: 0,
      activeGamesByTeam2: 0
    }
  });

  const { io, handlers } = createHarness(roomTable);

  await handlers.onCallDecided.call(
    { data: { roomId: roomTable.roomId, serial: 'four' }, emit() {} },
    { pass: true }
  );

  assert.deepEqual(roomTable.honorsPointsForHand, { team1: 90, team2: 0 });
  assert.equal(roomTable.currentCall, 4);
  assert.equal(roomTable.currentSetColor, 'clubs');
  assert.equal(roomTable.whoSetColor, 'one');

  roomTable.currentRound = 13;
  roomTable.currentPoints.setsTakenByTeam1 = 9;
  roomTable.cardsOnTable = [
    { serial: 'one', playedBy: 'one', card: { cardType: 'diamonds', cardValue: 'ace' } },
    { serial: 'two', playedBy: 'two', card: { cardType: 'diamonds', cardValue: 'king' } },
    { serial: 'three', playedBy: 'three', card: { cardType: 'diamonds', cardValue: 'queen' } },
    { serial: 'four', playedBy: 'four', card: { cardType: 'diamonds', cardValue: 'jack' } }
  ];

  await handlers.onRoundComplete.call({ data: { roomId: roomTable.roomId } });

  assert.equal(roomTable.currentPoints.team1, 114);
  assert.equal(roomTable.currentPoints.team2, 0);

  const updatePointEvents = io.emissions.filter(event => event.event === 'update_points');
  assert.equal(updatePointEvents.length, 1);

  const scoredEvent = io.emissions.find(event => event.event === 'game_scored');
  assert.ok(scoredEvent);
  assert.deepEqual(scoredEvent.payload.honorsPoints, { team1: 90, team2: 0 });
  assert.deepEqual(scoredEvent.payload.gamePoints, { team1: 24, team2: 0 });
  assert.equal(io.emissions.find(event => event.event === 'bonus_notification'), undefined);
});

test('caller gets a 50 point bonus for finishing with 12 tricks', async () => {
  const roomTable = createRoomTable({
    cards: {
      one: [],
      two: [
        { cardType: 'spades', cardValue: 'ace' },
        { cardType: 'spades', cardValue: 'king' },
        { cardType: 'spades', cardValue: 'queen' }
      ],
      three: [],
      four: []
    },
    biddingActivePlayer: 'one',
    biddingHighestBid: { call: 3, color: 'spades', personCalled: 'two' },
    biddingPasses: 2,
    biddingHistory: [{ call: 3, color: 'spades', personCalled: 'two' }]
  });

  const { io, handlers } = createHarness(roomTable);

  await handlers.onCallDecided.call(
    { data: { roomId: roomTable.roomId, serial: 'one' }, emit() {} },
    { pass: true }
  );

  roomTable.currentRound = 13;
  roomTable.currentPoints.setsTakenByTeam2 = 11;
  roomTable.cardsOnTable = [
    { serial: 'two', playedBy: 'two', card: { cardType: 'clubs', cardValue: 'ace' } },
    { serial: 'three', playedBy: 'three', card: { cardType: 'clubs', cardValue: 'king' } },
    { serial: 'four', playedBy: 'four', card: { cardType: 'clubs', cardValue: 'queen' } },
    { serial: 'one', playedBy: 'one', card: { cardType: 'clubs', cardValue: 'jack' } }
  ];

  await handlers.onRoundComplete.call({ data: { roomId: roomTable.roomId } });

  assert.equal(roomTable.currentPoints.team2, 134);

  const scoredEvent = io.emissions.find(event => event.event === 'game_scored');
  assert.ok(scoredEvent);
  assert.deepEqual(scoredEvent.payload.honorsPoints, { team1: 0, team2: 30 });
  assert.deepEqual(scoredEvent.payload.gamePoints, { team1: 0, team2: 54 });
  const bonusEvent = io.emissions.find(event => event.event === 'bonus_notification');
  assert.ok(bonusEvent);
  assert.equal(bonusEvent.payload, 'LS bonus! +50 points.');
});

test('caller gets a 100 point bonus for finishing with 13 tricks after making the contract', async () => {
  const roomTable = createRoomTable({
    cards: {
      one: [],
      two: [],
      three: [],
      four: []
    },
    biddingActivePlayer: 'two',
    biddingHighestBid: { call: 2, color: 'hearts', personCalled: 'three' },
    biddingPasses: 2,
    biddingHistory: [{ call: 2, color: 'hearts', personCalled: 'three' }]
  });

  const { io, handlers } = createHarness(roomTable);

  await handlers.onCallDecided.call(
    { data: { roomId: roomTable.roomId, serial: 'two' }, emit() {} },
    { pass: true }
  );

  roomTable.currentRound = 13;
  roomTable.currentPoints.setsTakenByTeam1 = 12;
  roomTable.cardsOnTable = [
    { serial: 'three', playedBy: 'three', card: { cardType: 'spades', cardValue: 'ace' } },
    { serial: 'four', playedBy: 'four', card: { cardType: 'spades', cardValue: 'king' } },
    { serial: 'one', playedBy: 'one', card: { cardType: 'spades', cardValue: 'queen' } },
    { serial: 'two', playedBy: 'two', card: { cardType: 'spades', cardValue: 'jack' } }
  ];

  await handlers.onRoundComplete.call({ data: { roomId: roomTable.roomId } });

  const scoredEvent = io.emissions.find(event => event.event === 'game_scored');
  assert.ok(scoredEvent);
  const bonusEvent = io.emissions.find(event => event.event === 'bonus_notification');
  assert.ok(bonusEvent);
  assert.equal(bonusEvent.payload, 'GS bonus! +100 points.');
});
