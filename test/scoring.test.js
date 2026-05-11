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
    contractDoubled: false,
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

test('doubled contract penalizes 100 per undertrick', async () => {
  const roomTable = createRoomTable({
    currentRound: 13,
    currentSetColor: 'spades',
    currentCall: 3,
    whoSetColor: 'two',
    contractDoubled: true,
    currentPoints: {
      team1: 0,
      team2: 0,
      setsTakenByTeam1: 8,
      setsTakenByTeam2: 4,
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

  const { io, handlers } = createHarness(roomTable);

  await handlers.onRoundComplete.call({ data: { roomId: roomTable.roomId } });

  const scoredEvent = io.emissions.find(event => event.event === 'game_scored');
  assert.ok(scoredEvent);
  assert.deepEqual(scoredEvent.payload.gamePoints, { team1: 0, team2: -400 });
  assert.equal(roomTable.currentPoints.team2, -400);
});

test('made doubled contract doubles game points and awards false call bonus', async () => {
  const roomTable = createRoomTable({
    currentRound: 13,
    currentSetColor: 'hearts',
    currentCall: 2,
    whoSetColor: 'one',
    contractDoubled: true,
    currentPoints: {
      team1: 8,
      team2: 0,
      setsTakenByTeam1: 8,
      setsTakenByTeam2: 4,
      activeGamesByTeam1: 0,
      activeGamesByTeam2: 0
    },
    cardsOnTable: [
      { serial: 'one', playedBy: 'one', card: { cardType: 'clubs', cardValue: 'ace' } },
      { serial: 'two', playedBy: 'two', card: { cardType: 'clubs', cardValue: 'king' } },
      { serial: 'three', playedBy: 'three', card: { cardType: 'clubs', cardValue: 'queen' } },
      { serial: 'four', playedBy: 'four', card: { cardType: 'clubs', cardValue: 'jack' } }
    ]
  });

  const { io, handlers } = createHarness(roomTable);

  await handlers.onRoundComplete.call({ data: { roomId: roomTable.roomId } });

  const scoredEvent = io.emissions.find(event => event.event === 'game_scored');
  assert.ok(scoredEvent);
  assert.deepEqual(scoredEvent.payload.gamePoints, { team1: 48, team2: 0 });
  assert.equal(roomTable.currentPoints.team1, 156);
  assert.equal(roomTable.currentPoints.activeGamesByTeam1, 1);

  const bonusEvents = io.emissions.filter(event => event.event === 'bonus_notification');
  assert.equal(bonusEvents.length, 2);
  assert.equal(bonusEvents[0].payload, 'False call bonus! +50 points.');
  assert.equal(bonusEvents[1].payload, 'Doubled overtrick bonus! +50 points.');
});

test('made doubled contract with overtricks adds 50 per extra trick and includes it in scoring message', async () => {
  const roomTable = createRoomTable({
    currentRound: 13,
    currentSetColor: 'hearts',
    currentCall: 2,
    whoSetColor: 'one',
    contractDoubled: true,
    currentPoints: {
      team1: 0,
      team2: 0,
      setsTakenByTeam1: 9,
      setsTakenByTeam2: 4,
      activeGamesByTeam1: 0,
      activeGamesByTeam2: 0
    },
    cardsOnTable: [
      { serial: 'one', playedBy: 'one', card: { cardType: 'clubs', cardValue: 'ace' } },
      { serial: 'two', playedBy: 'two', card: { cardType: 'clubs', cardValue: 'king' } },
      { serial: 'three', playedBy: 'three', card: { cardType: 'clubs', cardValue: 'queen' } },
      { serial: 'four', playedBy: 'four', card: { cardType: 'clubs', cardValue: 'jack' } }
    ]
  });

  const { io, handlers } = createHarness(roomTable);

  await handlers.onRoundComplete.call({ data: { roomId: roomTable.roomId } });

  const scoredEvent = io.emissions.find(event => event.event === 'game_scored');
  assert.ok(scoredEvent);
  assert.deepEqual(scoredEvent.payload.gamePoints, { team1: 64, team2: 0 });
  assert.equal(
    scoredEvent.payload.message,
    'No honors points. Team 1 doubled game points +64. False call bonus +50. Doubled overtrick bonus +100.'
  );
  assert.equal(roomTable.currentPoints.team1, 214);

  const bonusEvents = io.emissions.filter(event => event.event === 'bonus_notification');
  assert.equal(bonusEvents.length, 2);
  assert.equal(bonusEvents[0].payload, 'False call bonus! +50 points.');
  assert.equal(bonusEvents[1].payload, 'Doubled overtrick bonus! +100 points.');
});

test('after 13 completed hands, game_scored includes a winner announcement with team names and totals', async () => {
  const roomTable = createRoomTable({
    completedGame: 12,
    currentRound: 13,
    currentSetColor: 'clubs',
    currentCall: 1,
    whoSetColor: 'one',
    currentPoints: {
      team1: 120,
      team2: 85,
      setsTakenByTeam1: 6,
      setsTakenByTeam2: 6,
      activeGamesByTeam1: 0,
      activeGamesByTeam2: 0
    },
    cardsOnTable: [
      { serial: 'one', playedBy: 'one', card: { cardType: 'spades', cardValue: 'ace' } },
      { serial: 'two', playedBy: 'two', card: { cardType: 'spades', cardValue: 'king' } },
      { serial: 'three', playedBy: 'three', card: { cardType: 'spades', cardValue: 'queen' } },
      { serial: 'four', playedBy: 'four', card: { cardType: 'spades', cardValue: 'jack' } }
    ]
  });

  const { io, handlers } = createHarness(roomTable);

  await handlers.onRoundComplete.call({ data: { roomId: roomTable.roomId } });

  const scoredEvent = io.emissions.find(event => event.event === 'game_scored');
  assert.ok(scoredEvent);
  assert.equal(
    scoredEvent.payload.gameCompleteAnnouncement,
    'Game complete. Team 1 (Player One and Player Three) scored 126. Team 2 (Player Two and Player Four) scored 85. Congrats Player One and Player Three, you win!'
  );
});

test('after a full 13-hand game, scores reset before the next shuffle window opens', async () => {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback) => {
    callback();
    return 0;
  };

  try {
    const roomTable = createRoomTable({
      completedGame: 12,
      currentRound: 13,
      currentSetColor: 'clubs',
      currentCall: 1,
      whoSetColor: 'one',
      currentPoints: {
        team1: 120,
        team2: 85,
        setsTakenByTeam1: 6,
        setsTakenByTeam2: 6,
        activeGamesByTeam1: 1,
        activeGamesByTeam2: 0
      },
      cardsOnTable: [
        { serial: 'one', playedBy: 'one', card: { cardType: 'spades', cardValue: 'ace' } },
        { serial: 'two', playedBy: 'two', card: { cardType: 'spades', cardValue: 'king' } },
        { serial: 'three', playedBy: 'three', card: { cardType: 'spades', cardValue: 'queen' } },
        { serial: 'four', playedBy: 'four', card: { cardType: 'spades', cardValue: 'jack' } }
      ]
    });

    const { io, handlers } = createHarness(roomTable);

    await handlers.onRoundComplete.call({ data: { roomId: roomTable.roomId } });

    assert.deepEqual(roomTable.currentPoints, {
      team1: 0,
      team2: 0,
      setsTakenByTeam1: 0,
      setsTakenByTeam2: 0,
      activeGamesByTeam1: 0,
      activeGamesByTeam2: 0
    });
    assert.equal(roomTable.completedGame, 0);

    const updatePointEvents = io.emissions.filter(event => event.event === 'update_points');
    assert.equal(updatePointEvents.length, 2);
    assert.deepEqual(updatePointEvents[1].payload, roomTable.currentPoints);

    const canShuffleEvents = io.emissions.filter(event => event.event === 'can_shuffle');
    assert.equal(canShuffleEvents.length, 1);
    assert.equal(canShuffleEvents[0].payload, true);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});
