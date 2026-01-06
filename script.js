// Global variables
let cy; // Cytoscape instance
let dfa = {
    states: [],
    alphabet: [],
    startState: '',
    acceptStates: [],
    transitions: {} // { state: { symbol: nextState } }
};

let simulationState = {
    currentState: '',
    remainingInput: '',
    history: [],
    isRunning: false,
    intervalId: null,
    isPlaying: false,
    speed: 'normal',
    stepIndex: 0,
    totalSteps: 0,
    processed: [],
    path: []
};

const speedMap = {
    slow: 1000,
    normal: 600,
    fast: 300
};

document.addEventListener('DOMContentLoaded', () => {
    initCy();
    setupEventListeners();
    // Initialize with default values
    generateTransitionInputs();
    updateDFA(); 
});

function initCy() {
    cy = cytoscape({
        container: document.getElementById('cy'),
        style: [
            {
                selector: 'node',
                style: {
                    'label': 'data(id)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'background-color': '#fff',
                    'border-width': 2,
                    'border-color': '#666',
                    'width': 50,
                    'height': 50
                }
            },
            {
                selector: 'node.accept',
                style: {
                    'border-width': 4,
                    'border-style': 'double'
                }
            },
            {
                selector: 'node.start',
                style: {
                    'background-color': '#e6f7ff'
                }
            },
            {
                selector: 'node.current',
                style: {
                    'background-color': '#f1c40f',
                    'transition-property': 'background-color, box-shadow, transform',
                    'transition-duration': '0.6s',
                    'box-shadow': '0 0 15px rgba(241,196,15,0.7)',
                    'transform': 'scale(1.08)'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#ccc',
                    'target-arrow-color': '#ccc',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'label': 'data(label)',
                    'text-rotation': 'autorotate',
                    'text-margin-y': -10
                }
            },
            {
                selector: 'edge.active',
                style: {
                    'line-color': '#f1c40f',
                    'target-arrow-color': '#f1c40f',
                    'width': 4,
                    'transition-property': 'line-color, width',
                    'transition-duration': '0.6s'
                }
            }
        ],
        layout: {
            name: 'grid',
            rows: 1
        }
    });
}

function setupEventListeners() {
    document.getElementById('generate-transitions-btn').addEventListener('click', generateTransitionInputs);
    document.getElementById('create-dfa-btn').addEventListener('click', updateDFA);
    
    document.getElementById('start-btn').addEventListener('click', startSimulation);
    document.getElementById('play-btn').addEventListener('click', playSimulation);
    document.getElementById('pause-btn').addEventListener('click', pauseSimulation);
    document.getElementById('step-btn').addEventListener('click', stepSimulation);
    document.getElementById('reset-btn').addEventListener('click', resetSimulation);
    document.getElementById('fit-btn').addEventListener('click', () => {
        if (cy) {
            cy.fit();
        }
    });
    const speedSelect = document.getElementById('speed-select');
    if (speedSelect) {
        speedSelect.addEventListener('change', (e) => {
            simulationState.speed = e.target.value;
            updateAnimationDuration();
        });
    }
}

function updateAnimationDuration() {
    const ms = speedMap[simulationState.speed] || 600;
    const dur = `${ms}ms`;
    if (cy) {
        cy.style()
          .selector('node.current').style('transition-duration', dur)
          .selector('edge.active').style('transition-duration', dur)
          .update();
    }
    document.documentElement.style.setProperty('--animation-duration', dur);
}

function getInputValue(id) {
    return document.getElementById(id).value.split(',').map(s => s.trim()).filter(s => s !== '');
}

function generateTransitionInputs() {
    const states = getInputValue('states-input');
    const alphabet = getInputValue('alphabet-input');
    const container = document.getElementById('transitions-inputs');
    
    container.innerHTML = '';
    
    if (states.length === 0 || alphabet.length === 0) {
        container.innerHTML = '<p>Please define states and alphabet first.</p>';
        return;
    }

    states.forEach(state => {
        alphabet.forEach(symbol => {
            const div = document.createElement('div');
            div.className = 'transition-row';
            
            const label = document.createElement('label');
            label.textContent = `δ(${state}, ${symbol}) = `;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Next State';
            input.dataset.from = state;
            input.dataset.symbol = symbol;
            
            // Try to preserve existing value if available
            if (dfa.transitions[state] && dfa.transitions[state][symbol]) {
                input.value = dfa.transitions[state][symbol];
            }

            div.appendChild(label);
            div.appendChild(input);
            container.appendChild(div);
        });
    });
}

function updateDFA() {
    // 1. Parse Inputs
    dfa.states = getInputValue('states-input');
    dfa.alphabet = getInputValue('alphabet-input');
    dfa.startState = document.getElementById('start-state-input').value.trim();
    dfa.acceptStates = getInputValue('accept-states-input');
    
    dfa.transitions = {};
    const inputs = document.querySelectorAll('#transitions-inputs input');
    
    let isValid = true;
    
    inputs.forEach(input => {
        const from = input.dataset.from;
        const symbol = input.dataset.symbol;
        const to = input.value.trim();
        
        if (to) {
            if (!dfa.states.includes(to)) {
                alert(`Invalid next state '${to}' for transition δ(${from}, ${symbol}). Must be one of: ${dfa.states.join(', ')}`);
                isValid = false;
            }
            if (!dfa.transitions[from]) dfa.transitions[from] = {};
            dfa.transitions[from][symbol] = to;
        }
    });

    if (!isValid) return;

    // 2. Update Graph
    renderGraph();
    
    // 3. Reset Simulation
    resetSimulation();
}

function renderGraph() {
    const elements = [];
    
    // Nodes
    dfa.states.forEach(state => {
        const classes = [];
        if (dfa.acceptStates.includes(state)) classes.push('accept');
        if (state === dfa.startState) classes.push('start');
        
        elements.push({
            group: 'nodes',
            data: { id: state },
            classes: classes.join(' ')
        });
    });
    
    // Edges
    // Group edges by (from, to) to combine labels
    const edges = {};
    
    Object.keys(dfa.transitions).forEach(from => {
        Object.keys(dfa.transitions[from]).forEach(symbol => {
            const to = dfa.transitions[from][symbol];
            const key = `${from}-${to}`;
            
            if (!edges[key]) {
                edges[key] = { from, to, symbols: [] };
            }
            edges[key].symbols.push(symbol);
        });
    });
    
    Object.values(edges).forEach(edge => {
        elements.push({
            group: 'edges',
            data: {
                id: `${edge.from}-${edge.to}`,
                source: edge.from,
                target: edge.to,
                label: edge.symbols.join(', ')
            }
        });
    });
    
    cy.elements().remove();
    cy.add(elements);
    
    const layout = cy.layout({
        name: 'cose',
        animate: true,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: 400000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0
    });
    
    layout.run();
}

function startSimulation() {
    const inputString = document.getElementById('input-string').value.trim();
    
    // Validation
    for (let char of inputString) {
        if (!dfa.alphabet.includes(char)) {
            alert(`Invalid character '${char}' in input string. Allowed: ${dfa.alphabet.join(', ')}`);
            return;
        }
    }
    
    if (!dfa.states.includes(dfa.startState)) {
        alert('Start state is not valid.');
        return;
    }

    simulationState.currentState = dfa.startState;
    simulationState.remainingInput = inputString;
    simulationState.history = [];
    simulationState.isRunning = true;
    simulationState.isPlaying = false;
    simulationState.stepIndex = 0;
    simulationState.totalSteps = inputString.length;
    simulationState.processed = [];
    simulationState.path = [dfa.startState];
    
    updateSimulationUI();
    updateButtons();
    
    highlightState(simulationState.currentState);
    updateAnimationDuration();
}

function stepSimulation() {
    if (!simulationState.isRunning) return;
    
    if (simulationState.remainingInput.length === 0) {
        finishSimulation();
        return;
    }
    
    const symbol = simulationState.remainingInput[0];
    const currentState = simulationState.currentState;
    
    const nextState = dfa.transitions[currentState] ? dfa.transitions[currentState][symbol] : undefined;
    
    if (!nextState) {
        // Trap state or undefined transition -> Reject
        simulationState.isRunning = false;
        document.getElementById('result-message').textContent = "Stuck! No transition defined. REJECTED";
        document.getElementById('result-message').className = "rejected";
        updateButtons();
        return;
    }
    
    const edgeId = `${currentState}-${nextState}`;
    cy.edges().removeClass('active');
    highlightEdge(edgeId);
    
    simulationState.currentState = nextState;
    simulationState.remainingInput = simulationState.remainingInput.substring(1);
    simulationState.processed.push(symbol);
    simulationState.stepIndex += 1;
    simulationState.path.push(nextState);
    
    updateSimulationUI();
    highlightState(nextState);
    
    if (simulationState.remainingInput.length === 0) {
        finishSimulation();
    }
}

function finishSimulation() {
    simulationState.isRunning = false;
    simulationState.isPlaying = false;
    if (simulationState.intervalId) {
        clearTimeout(simulationState.intervalId);
        simulationState.intervalId = null;
    }
    updateButtons();
    
    const isAccepted = dfa.acceptStates.includes(simulationState.currentState);
    const resultEl = document.getElementById('result-message');
    
    if (isAccepted) {
        resultEl.textContent = "String Accepted!";
        resultEl.className = "accepted";
    } else {
        resultEl.textContent = "String Rejected!";
        resultEl.className = "rejected";
    }
}

function resetSimulation() {
    simulationState.isRunning = false;
    simulationState.currentState = '';
    simulationState.remainingInput = '';
    simulationState.isPlaying = false;
    simulationState.stepIndex = 0;
    simulationState.totalSteps = 0;
    simulationState.processed = [];
    simulationState.path = [];
    if (simulationState.intervalId) {
        clearTimeout(simulationState.intervalId);
        simulationState.intervalId = null;
    }
    
    updateButtons(true);
    
    document.getElementById('current-state-display').textContent = '-';
    document.getElementById('remaining-input-display').textContent = '-';
    document.getElementById('result-message').textContent = '';
    document.getElementById('result-message').className = '';
    document.getElementById('step-count').textContent = 'Step 0 of 0';
    const ip = document.getElementById('input-progress');
    if (ip) ip.innerHTML = '';
    const pt = document.getElementById('path-taken');
    if (pt) pt.innerHTML = '';
    
    cy.nodes().removeClass('current');
    cy.edges().removeClass('active');
}

function updateSimulationUI() {
    document.getElementById('current-state-display').textContent = simulationState.currentState;
    document.getElementById('remaining-input-display').textContent = simulationState.remainingInput || "(empty)";
    document.getElementById('step-count').textContent = `Step ${simulationState.stepIndex} of ${simulationState.totalSteps}`;
    renderInputProgress();
    renderPathTaken();
}

function highlightState(stateId) {
    cy.nodes().removeClass('current');
    cy.edges().removeClass('active'); // Clear previous edge highlights
    cy.$(`#${stateId}`).addClass('current');
}

function highlightEdge(edgeId) {
    cy.$(`#${edgeId}`).addClass('active');
}

function renderInputProgress() {
    const container = document.getElementById('input-progress');
    if (!container) return;
    container.innerHTML = '';
    simulationState.processed.forEach(ch => {
        const pill = document.createElement('span');
        pill.className = 'symbol-pill consumed';
        pill.textContent = ch;
        container.appendChild(pill);
    });
}

function renderPathTaken() {
    const container = document.getElementById('path-taken');
    if (!container) return;
    container.innerHTML = '';
    simulationState.path.forEach((st, idx) => {
        const pill = document.createElement('span');
        pill.className = 'state-pill' + (idx === simulationState.path.length - 1 ? ' current' : '');
        pill.textContent = st;
        container.appendChild(pill);
    });
}

function updateButtons(reset = false) {
    const start = document.getElementById('start-btn');
    const play = document.getElementById('play-btn');
    const pause = document.getElementById('pause-btn');
    const step = document.getElementById('step-btn');
    const resetBtn = document.getElementById('reset-btn');
    const inputEl = document.getElementById('input-string');
    if (reset) {
        start.disabled = false;
        inputEl.disabled = false;
        play.disabled = true;
        pause.disabled = true;
        step.disabled = true;
        resetBtn.disabled = true;
        return;
    }
    start.disabled = true;
    inputEl.disabled = true;
    step.disabled = !simulationState.isRunning;
    resetBtn.disabled = !simulationState.isRunning && simulationState.stepIndex === 0;
    const finished = !simulationState.isRunning && simulationState.stepIndex === simulationState.totalSteps;
    play.disabled = finished || !simulationState.isRunning;
    pause.disabled = finished || !simulationState.isRunning || !simulationState.isPlaying;
}

function playSimulation() {
    if (!simulationState.isRunning) return;
    simulationState.isPlaying = true;
    updateButtons();
    scheduleNextStep();
}

function scheduleNextStep() {
    if (!simulationState.isPlaying) return;
    if (simulationState.remainingInput.length === 0) {
        finishSimulation();
        return;
    }
    if (simulationState.intervalId) {
        clearTimeout(simulationState.intervalId);
        simulationState.intervalId = null;
    }
    simulationState.intervalId = setTimeout(() => {
        stepSimulation();
        scheduleNextStep();
    }, speedMap[simulationState.speed] || 600);
}

function pauseSimulation() {
    simulationState.isPlaying = false;
    if (simulationState.intervalId) {
        clearTimeout(simulationState.intervalId);
        simulationState.intervalId = null;
    }
    updateButtons();
}
