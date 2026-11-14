/*
  =====================================================================
  script.js: WHAT HAPPENS in Tiny Town (the "brain")
  =====================================================================
  This file:
    1. Remembers your tasks and your town (saved in the browser)
    2. Draws the town on screen (shops, plants, walking villagers)
    3. Reacts when you add, tick or delete a task
    4. Switches between day and night

  How it connects to the other files:
    - It FINDS elements from index.html using their id
      (e.g. document.getElementById('taskInput')).
    - It ADDS or REMOVES CSS classes (like "night" or "pop"), and
      style.css decides what those classes look like.

  Read it from top to bottom: each section has a big heading.
  =====================================================================
*/


/* =====================================================================
   SECTION 1: SETTINGS: image lists and building spots
   ===================================================================== */

/*
  CONCEPT: const
  "const" creates a named box for a value that will never be replaced.
  "let" creates one that CAN change later.
*/

// How many images we have in each assets folder
const SHOP_COUNT = 15;
const PLANT_COUNT = 34;
const VILLAGER_COUNT = 14;

/*
  CONCEPT: function
  A function is a reusable recipe. You write the steps once and
  "call" it whenever you need it, e.g.  pad(3)  →  "03".
*/
// Turns 3 into "03", so it matches file names like shop-03.png
function pad(number) {
  return String(number).padStart(2, '0');
}

/*
  CONCEPT: array
  An array is a numbered list: ['a', 'b', 'c'].
  Array.from({ length: 15 }, ...) makes a list of 15 items, and for each
  position i (starting at 0) we build the file path.
*/
const SHOP_IMAGES     = Array.from({ length: SHOP_COUNT },     (_, i) => `assets/shops/shop-${pad(i + 1)}.png`);
const PLANT_IMAGES    = Array.from({ length: PLANT_COUNT },    (_, i) => `assets/plants/plant-${pad(i + 1)}.png`);
const VILLAGER_IMAGES = Array.from({ length: VILLAGER_COUNT }, (_, i) => `assets/villagers/villager-${pad(i + 1)}.png`);

/*
  CONCEPT: object
  An object groups related information with labels (keys):
      { left: 2, bottom: 16, row: 'back' }
  Here, each "slot" is a spot on the meadow where a shop can be built.
  Numbers are percentages of the scene, so the town scales with the screen.
  The back row is higher up (further away), the front row is lower (closer to you).
*/
const SHOP_SLOTS = [
  // back row: 9 spots
  ...[2, 13, 24, 35, 46, 57, 68, 79, 90].map(left => ({ left, bottom: 16, row: 'back' })),
  // front row: 8 spots, shifted so they sit in the gaps of the back row
  ...[7, 18, 29, 40, 51, 62, 73, 84].map(left => ({ left, bottom: 3, row: 'front' })),
];

// The key (name) we save our data under in the browser's storage
const STORAGE_KEY = 'tinyTown_v1';


/* =====================================================================
   SECTION 2: FINDING THE HTML ELEMENTS WE NEED
   ===================================================================== */
/*
  CONCEPT: the DOM
  The browser turns index.html into a tree of objects called the DOM
  (Document Object Model). getElementById finds one element by its id,
  so JavaScript can read it or change it.
*/
const scene        = document.getElementById('scene');
const townLayer    = document.getElementById('town');
const starsLayer   = document.getElementById('stars');
const emptySign    = document.getElementById('emptySign');
const taskForm     = document.getElementById('taskForm');
const taskInput    = document.getElementById('taskInput');
const sizeButtons  = document.querySelectorAll('.size-btn');   // querySelectorAll finds ALL matches
const todoList     = document.getElementById('todoList');
const doneList     = document.getElementById('doneList');
const noTasksHint  = document.getElementById('noTasks');
const townNameInput = document.getElementById('townNameInput');
const dayNightBtn  = document.getElementById('dayNightBtn');
const toast        = document.getElementById('toast');


/* =====================================================================
   SECTION 3: THE STATE (everything the app remembers)
   ===================================================================== */
/*
  "State" = all the information that describes the app right now.
  If we know the state, we can redraw the whole screen from it.
  That's the main idea of this project:

      state changes  →  save it  →  redraw the screen

  Here's what a fresh, empty town looks like:
*/
function createEmptyState() {
  return {
    townName: 'Tiny Town',
    createdAt: Date.now(),      // Date.now() = the current time in milliseconds
    mode: 'auto',               // 'auto' (follows the clock), 'day' or 'night'
    tasks: [],                  // e.g. { id, text, size: 'small', done: false }
    shops: [],                  // e.g. { image: 'assets/shops/shop-04.png', slot: 3 }
    plants: [],                 // e.g. { image: '...', left: 40.2, bottom: 1.5 }
    villagers: [],              // e.g. 'assets/villagers/villager-07.png'
  };
}

/*
  CONCEPT: localStorage
  localStorage is a small notebook inside the browser. It keeps data
  even after you close the tab. It can only store TEXT, so:
    - JSON.stringify(object) turns our object INTO text to save it
    - JSON.parse(text) turns the text back INTO an object
  Note: it's saved only on THIS device and browser.
*/
function loadState() {
  const savedText = localStorage.getItem(STORAGE_KEY);
  if (!savedText) return createEmptyState();          // nothing saved yet → new town

  // "try / catch" = try something risky; if it breaks, run the catch part instead of crashing
  try {
    // { ...a, ...b } merges two objects (b's values win), so old saves still get any new keys
    return { ...createEmptyState(), ...JSON.parse(savedText) };
  } catch (error) {
    console.warn('Saved town was broken, starting fresh.', error);
    return createEmptyState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// "let" because state gets replaced when the user resets the town
let state = loadState();

// Which size button is selected right now (starts as small)
let selectedSize = 'small';


/* =====================================================================
   SECTION 4: SMALL HELPER FUNCTIONS
   ===================================================================== */

// Picks one random item from a list
function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
  // Math.random() gives a number between 0 and 1 (like 0.73).
  // Multiply by the list length and round down → a random index.
}

// A random decimal number between min and max
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// A unique id for each task, made from the time plus a random bit
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/*
  Bottom position → layer. Things lower on the screen are closer to you,
  so they must be drawn ON TOP. A lower "bottom" gives a higher z-index.
*/
function layerFor(bottom) {
  return Math.round(1000 - bottom * 10);
}

// Shows the little pop-up message at the bottom for 2.8 seconds
let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');               // style.css slides it up
  clearTimeout(toastTimer);                  // if one was already showing, restart the timer
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  /*
    CONCEPT: setTimeout
    setTimeout(doSomething, 2800) = "wait 2800 milliseconds (2.8 s), then doSomething".
  */
}

// Shoots little ✨ sparkles out from an element (used when something is built)
function sparkleAt(element) {
  // Work out where the element is, relative to the scene
  const box = element.getBoundingClientRect();
  const sceneBox = scene.getBoundingClientRect();
  const centerX = box.left - sceneBox.left + box.width / 2;
  const centerY = box.top - sceneBox.top + box.height / 2;

  for (let i = 0; i < 8; i++) {                     // a "for loop" repeats 8 times
    const sparkle = document.createElement('span'); // create a brand-new element
    sparkle.className = 'sparkle';
    sparkle.textContent = randomItem(['✨', '⭐', '💫', '🌸']);
    sparkle.style.left = centerX + 'px';
    sparkle.style.top = centerY + 'px';

    // Each sparkle flies in a different direction around a circle.
    // Angle in radians: a full circle is 2π, split into 8 directions.
    const angle = (i / 8) * Math.PI * 2;
    const distance = randomBetween(40, 80);
    sparkle.style.setProperty('--dx', Math.cos(angle) * distance + 'px');  // cos = how far sideways
    sparkle.style.setProperty('--dy', Math.sin(angle) * distance + 'px');  // sin = how far up/down

    scene.appendChild(sparkle);                          // add it to the page
    setTimeout(() => sparkle.remove(), 950);             // remove it once the animation ends
  }
}


/* =====================================================================
   SECTION 5: DRAWING THE TOWN
   ===================================================================== */

/*
  drawTown() clears the town layer and rebuilds it from the state.
  "isNew" tells us which item was JUST built, so only that one pops.
*/
function drawTown(newItem = null) {
  townLayer.innerHTML = '';   // empty the layer first

  // --- Shops ---
  state.shops.forEach((shop, index) => {
    const slot = SHOP_SLOTS[shop.slot];
    const img = document.createElement('img');
    img.src = shop.image;
    img.alt = 'A shop';
    img.className = `thing shop ${slot.row}`;     // e.g. "thing shop back"
    img.style.left = slot.left + '%';
    img.style.bottom = slot.bottom + '%';
    img.style.zIndex = layerFor(slot.bottom);
    if (newItem && newItem.type === 'shop' && newItem.index === index) img.classList.add('pop');
    townLayer.appendChild(img);
  });

  // --- Plants ---
  state.plants.forEach((plant, index) => {
    const img = document.createElement('img');
    img.src = plant.image;
    img.alt = 'A potted plant';
    img.className = 'thing plant';
    img.style.left = plant.left + '%';
    img.style.bottom = plant.bottom + '%';
    img.style.zIndex = layerFor(plant.bottom);
    if (newItem && newItem.type === 'plant' && newItem.index === index) img.classList.add('pop');
    townLayer.appendChild(img);
  });

  // --- Villagers (they walk, so they're handled differently) ---
  state.villagers.forEach((villagerImage, index) => {
    const walker = document.createElement('div');
    walker.className = 'thing villager walker resting';
    walker.style.left = randomBetween(5, 90) + '%';       // start somewhere random
    walker.style.bottom = (1 + (index % 3)) + '%';        // three "lanes" so they don't all overlap
    walker.style.zIndex = 990;                            // always in front of buildings

    const img = document.createElement('img');
    img.src = villagerImage;
    img.alt = 'A villager';
    walker.appendChild(img);

    if (newItem && newItem.type === 'villager' && newItem.index === index) walker.classList.add('pop');
    townLayer.appendChild(walker);
    startWandering(walker);
  });

  // Hide the "empty meadow" sign once anything exists
  const isEmpty = state.shops.length + state.plants.length + state.villagers.length === 0;
  emptySign.classList.toggle('hidden', !isEmpty);   // toggle(class, condition) adds it if true, removes it if false

  // Sparkles on the newest item. requestAnimationFrame waits until the browser has drawn it.
  if (newItem) {
    requestAnimationFrame(() => {
      const newest = townLayer.querySelector('.pop');
      if (newest) sparkleAt(newest);
    });
  }

  updateStats();
}

/*
  Makes one villager walk around forever:
    1. pick a new spot
    2. slide there (CSS "transition" animates the change of "left")
    3. rest for a moment
    4. repeat
*/
function startWandering(walker) {
  function walkSomewhere() {
    if (!walker.isConnected) return;   // stop if this villager was removed from the page

    const currentLeft = parseFloat(walker.style.left);
    const targetLeft = randomBetween(3, 92);
    const distance = Math.abs(targetLeft - currentLeft);   // Math.abs makes it positive
    const seconds = distance * 0.35;                       // longer walks take longer

    walker.classList.remove('resting');                    // start bouncing
    walker.style.transitionDuration = seconds + 's';
    walker.style.left = targetLeft + '%';

    // When they arrive: rest for 1–4 seconds, then walk again
    setTimeout(() => {
      walker.classList.add('resting');
      setTimeout(walkSomewhere, randomBetween(1000, 4000));
    }, seconds * 1000);
  }

  // Each villager waits a different time before the first walk, so they don't move in sync
  setTimeout(walkSomewhere, randomBetween(500, 2500));
}

// Updates the numbers in the header
function updateStats() {
  const daysOld = Math.floor((Date.now() - state.createdAt) / (1000 * 60 * 60 * 24)) + 1;
  // (1000 ms × 60 s × 60 min × 24 h) = the number of milliseconds in one day
  document.getElementById('statDay').textContent = daysOld;
  document.getElementById('statShops').textContent = state.shops.length;
  document.getElementById('statPlants').textContent = state.plants.length;
  document.getElementById('statVillagers').textContent = state.villagers.length;
  document.getElementById('statDone').textContent = state.tasks.filter(task => task.done).length;
  // .filter() keeps only the items that pass the test, here only the done tasks
}


/* =====================================================================
   SECTION 6: BUILDING THINGS (the reward for finishing a task)
   ===================================================================== */

// Adds a plant at a random spot in the front of the meadow
function buildPlant() {
  state.plants.push({                     // .push() adds an item to the END of a list
    image: randomItem(PLANT_IMAGES),
    left: randomBetween(1, 95),
    bottom: randomBetween(0, 4),
  });
  return { type: 'plant', index: state.plants.length - 1 };
}

// Adds a shop in a free slot, using a shop image we haven't used yet
function buildShop() {
  // Which slots and images are already taken?
  const usedSlots = state.shops.map(shop => shop.slot);       // .map() turns each item into something else
  const usedImages = state.shops.map(shop => shop.image);

  const freeSlots = SHOP_SLOTS.map((_, i) => i).filter(i => !usedSlots.includes(i));
  const freeImages = SHOP_IMAGES.filter(image => !usedImages.includes(image));

  // Town full? Return null so the caller can give a plant instead.
  if (freeSlots.length === 0 || freeImages.length === 0) return null;

  state.shops.push({ image: randomItem(freeImages), slot: randomItem(freeSlots) });
  return { type: 'shop', index: state.shops.length - 1 };
}

// A new neighbour moves in (each villager only once)
function buildVillager() {
  const freeVillagers = VILLAGER_IMAGES.filter(image => !state.villagers.includes(image));
  if (freeVillagers.length === 0) return null;
  state.villagers.push(randomItem(freeVillagers));
  return { type: 'villager', index: state.villagers.length - 1 };
}

/*
  Decides WHAT to build for a finished task, based on its size.
  CONCEPT: if / else
  "if this is true, do A; otherwise, do B".
*/
function rewardFor(size) {
  let newItem;
  let message;

  if (size === 'small') {
    newItem = buildPlant();
    message = randomItem(['🌷 A little plant sprouted!', '🌱 Your town got greener!', '🌸 Flowers for the neighbours!']);

  } else if (size === 'medium') {
    newItem = buildShop();
    message = '🏪 A new shop opened in town!';
    if (!newItem) {                       // no room left → give a plant instead
      newItem = buildPlant();
      message = '🌷 Every shop is open! Have a flower instead.';
    }

  } else {                                // big task: a shop AND a new neighbour
    const shop = buildShop();
    const villager = buildVillager();
    newItem = villager || shop || buildPlant();   // "||" = use the first one that isn't null
    if (shop && villager) message = '🏰 Big win! A new shop AND a new neighbour moved in! 🐾';
    else if (villager)    message = '🐾 A new neighbour moved in!';
    else if (shop)        message = '🏪 A new shop opened in town!';
    else                  message = '🌷 Your town is complete! Here, have a flower.';
  }

  saveState();
  drawTown(newItem);
  showToast(message);

  // On phones the town is above the list, so scroll up to show the new building
  if (window.innerWidth < 900) {
    scene.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}


/* =====================================================================
   SECTION 7: THE TO-DO LIST
   ===================================================================== */

const SIZE_LABELS = { small: '🌱 small', medium: '🏠 medium', big: '🏰 big' };

// Rebuilds both lists (to-do and done) from the state
function drawTasks() {
  todoList.innerHTML = '';
  doneList.innerHTML = '';

  state.tasks.forEach(task => {
    const li = document.createElement('li');
    li.className = 'task' + (task.done ? ' done' : '');

    /*
      Building small elements with innerHTML is quick, BUT user text must
      never go straight into innerHTML (someone could type sneaky HTML).
      So we create the structure first, then set the text safely with textContent.
    */
    li.innerHTML = `
      <button class="check" title="Mark as done">${task.done ? '✔' : ''}</button>
      <span class="task-text"></span>
      <span class="tag ${task.size}">${SIZE_LABELS[task.size]}</span>
      <button class="delete" title="Delete task">🗑️</button>
    `;
    li.querySelector('.task-text').textContent = task.text;   // safe

    /*
      CONCEPT: event listener
      addEventListener('click', function) = "when this is clicked, run this function".
    */
    li.querySelector('.check').addEventListener('click', () => completeTask(task.id));
    li.querySelector('.delete').addEventListener('click', () => deleteTask(task.id));

    // The ternary operator  a ? b : c  means "if a, then b, else c"
    (task.done ? doneList : todoList).appendChild(li);
  });

  // Show the hint only when there's nothing left to do
  const openTasks = state.tasks.filter(task => !task.done).length;
  noTasksHint.classList.toggle('hidden', openTasks > 0);
  noTasksHint.textContent = state.tasks.length === 0
    ? 'No tasks yet. Add one above ✍️'
    : 'All done! Your town is proud of you 🥳';
}

// Adds a new task to the list
function addTask(text, size) {
  state.tasks.push({ id: makeId(), text: text, size: size, done: false });
  saveState();
  drawTasks();
}

// Ticks a task → it moves to "Done" and something gets built
function completeTask(id) {
  const task = state.tasks.find(t => t.id === id);    // .find() returns the first match
  if (!task || task.done) return;                     // already done? do nothing
  task.done = true;
  task.doneAt = Date.now();
  drawTasks();
  rewardFor(task.size);                               // build something (this also saves)
}

// Removes a task. Buildings stay: you earned them!
function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);   // keep every task EXCEPT this one
  saveState();
  drawTasks();
  updateStats();
}


/* =====================================================================
   SECTION 8: DAY AND NIGHT
   ===================================================================== */

// Creates 40 stars at random places in the sky (only once)
function makeStars() {
  for (let i = 0; i < 40; i++) {
    const star = document.createElement('span');
    star.className = 'star';
    star.style.left = randomBetween(0, 100) + '%';
    star.style.top = randomBetween(0, 100) + '%';
    star.style.animationDelay = randomBetween(0, 2.5) + 's';   // so they don't all twinkle together
    starsLayer.appendChild(star);
  }
}

/*
  Should it be night right now?
  In "auto" mode we look at the real clock: night is from 7 pm to 6 am.
*/
function isNightNow() {
  if (state.mode === 'day') return false;
  if (state.mode === 'night') return true;
  const hour = new Date().getHours();      // 0–23
  return hour >= 19 || hour < 6;
}

function applyDayNight() {
  scene.classList.toggle('night', isNightNow());   // style.css does the rest
  const labels = { auto: '🌗 Auto', day: '☀️ Day', night: '🌙 Night' };
  dayNightBtn.textContent = labels[state.mode];
}


/* =====================================================================
   SECTION 9: CONNECTING BUTTONS TO FUNCTIONS (event listeners)
   ===================================================================== */

// Choosing a task size: un-select all three buttons, then select the clicked one
sizeButtons.forEach(button => {
  button.addEventListener('click', () => {
    sizeButtons.forEach(b => b.classList.remove('selected'));
    button.classList.add('selected');
    selectedSize = button.dataset.size;    // reads the data-size="..." from the HTML
  });
});

// Adding a task. A form "submit" happens on the button click OR when pressing Enter.
taskForm.addEventListener('submit', event => {
  event.preventDefault();        // stop the browser from reloading the page (a form's default habit)
  const text = taskInput.value.trim();     // .trim() removes extra spaces at the start/end
  if (!text) return;
  addTask(text, selectedSize);
  taskInput.value = '';                    // empty the box for the next task
  taskInput.focus();                       // keep the cursor in the box
});

// Renaming the town: save every time the user types
townNameInput.addEventListener('input', () => {
  state.townName = townNameInput.value.trim() || 'Tiny Town';
  document.title = `${state.townName} 🏡`;
  saveState();
});

// Day/night button cycles: auto → day → night → auto
dayNightBtn.addEventListener('click', () => {
  const order = ['auto', 'day', 'night'];
  const nextIndex = (order.indexOf(state.mode) + 1) % order.length;
  // % (modulo) = the remainder after dividing. (2 + 1) % 3 = 0, so it loops back to the start.
  state.mode = order[nextIndex];
  saveState();
  applyDayNight();
  showToast(state.mode === 'auto' ? '🌗 Following the real clock' : state.mode === 'day' ? '☀️ Good morning, town!' : '🌙 Goodnight, town!');
});

// Demo button: adds some example tasks so people can try it quickly
document.getElementById('demoBtn').addEventListener('click', () => {
  const demoTasks = [
    ['Drink 2 glasses of water', 'small'],
    ['Reply to the class group', 'small'],
    ['Finish physics worksheet', 'medium'],
    ['Clean my desk', 'medium'],
    ['Submit lab report', 'big'],
  ];
  demoTasks.forEach(([text, size]) => addTask(text, size));   // [text, size] "unpacks" each pair
  showToast('✨ Demo tasks added: tick them to build your town!');
});

// Removes all finished tasks from the list (the buildings stay)
document.getElementById('clearDoneBtn').addEventListener('click', () => {
  state.tasks = state.tasks.filter(task => !task.done);
  saveState();
  drawTasks();
});

// Start over with a brand-new town (asks first, because it can't be undone)
document.getElementById('resetBtn').addEventListener('click', () => {
  const sure = confirm('Start a brand-new town? Your current town and tasks will be cleared.');
  if (!sure) return;
  state = createEmptyState();
  saveState();
  startApp();
  showToast('🌱 A fresh meadow. Let\'s build!');
});


/* =====================================================================
   SECTION 10: START THE APP
   ===================================================================== */
function startApp() {
  townNameInput.value = state.townName;
  document.title = `${state.townName} 🏡`;
  drawTasks();
  drawTown();
  applyDayNight();
}

makeStars();
startApp();

// Check the clock every minute, so "auto" mode turns to night by itself
setInterval(applyDayNight, 60 * 1000);
/*
  CONCEPT: setInterval
  Like setTimeout, but it repeats forever: "every 60 seconds, run applyDayNight".
*/
