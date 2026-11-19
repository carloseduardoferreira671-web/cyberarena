/* CyberWorld · layout do mapa — reprodução 3D da arte de referência (vale com a casona, rios, acampamentos e plantações).
   Coordenadas em blocos: X = leste, Z = sul (a arte é vista olhando para o norte, -Z). A casona fica no alto à esquerda,
   o rio principal desce do norte pelo lado direito dela e se divide em volta do acampamento vermelho da direita. */

export const LAYOUT = {
  world: { w: 200, h: 112, block: 1 },
  /* casona: centro, raio da plataforma, escala da construção e direção da fachada (graus, 0 = sul, + = para leste) */
  temple: { x: -17, z: -15, scale: 1.35, face: 28, platformR: 18 * 1.35 },
  rivers: [
    /* rio principal: nasce nas montanhas do norte, passa à direita da casona e corre para o leste */
    { id: 'R1', hw: 3.0, pts: [[4, -72], [5, -52], [5, -38], [9, -25], [14, -14], [18, -5], [21, 2], [28, 6], [42, 7], [54, 9], [64, 11], [76, 13], [96, 14], [116, 12]] },
    /* braço sul: contorna o acampamento vermelho da direita, passa sob a ponte da calçada e desce para o sul */
    { id: 'R2', hw: 2.3, pts: [[56, 9], [61, 18], [53, 27], [40, 29], [28, 28], [18, 28], [12, 31], [8, 37], [7, 44], [6, 58], [6, 72]] },
    /* riacho oeste: nasce ao pé da escadaria e desce entre o acampamento azul e o bege */
    { id: 'R3', hw: 1.8, pts: [[-11, 21], [-13, 25], [-18, 30], [-23, 35], [-26, 42], [-29, 52], [-31, 72]] },
    /* rio da esquerda: entra pela borda oeste e encontra o riacho */
    { id: 'R4', hw: 2.4, pts: [[-118, 25], [-96, 26], [-76, 25], [-63, 26], [-53, 25], [-43, 27], [-34, 31], [-27, 34], [-24, 37]] }
  ],
  roads: [
    /* calçada de pedra: escadaria da casona → praça → segunda escadaria → ponte → acampamento bege da direita */
    { id: 'main', kind: 'cobble', hw: 2.0, pts: [[2, 17], [6, 20], [10, 22], [14, 25], [18, 28], [22, 31]] },
    { id: 'D1', kind: 'dirt', hw: 1.1, pts: [[-58, 10], [-46, 14], [-34, 17], [-23, 19], [-11, 20], [0, 19]] },
    { id: 'D2', kind: 'dirt', hw: 1.1, pts: [[-60, 8], [-58, 3], [-56, -3], [-53, -10], [-47, -17], [-46, -25], [-40, -33], [-34, -44]] },
    { id: 'D3', kind: 'dirt', hw: 1.1, pts: [[36, -11], [29, -3], [22, 4], [16, 11], [10, 17], [6, 20]] },
    { id: 'D4', kind: 'dirt', hw: 1.0, pts: [[38, -12], [49, -7], [62, -13], [79, -19], [100, -23]] },
    { id: 'D5', kind: 'dirt', hw: 1.0, pts: [[16, 26], [24, 23], [30, 21], [36, 19]] },
    { id: 'D6', kind: 'dirt', hw: 1.0, pts: [[23, 31], [27, 35], [31, 39], [36, 44], [42, 56]] },
    { id: 'D7', kind: 'dirt', hw: 1.0, pts: [[-8, 30], [-3, 28], [3, 26], [11, 24]] },
    { id: 'D8', kind: 'dirt', hw: 1.0, pts: [[-39, 26], [-33, 23], [-27, 21], [-21, 20]] },
    { id: 'D9', kind: 'dirt', hw: 1.0, pts: [[36, -11], [30, -22], [26, -34], [24, -48]] }
  ],
  camps: [
    { id: 'C1', x: -59, z: 9, roof: 'red' },     // vermelho, esquerda
    { id: 'C2', x: -39, z: 27, roof: 'teal' },   // azul, embaixo à esquerda
    { id: 'C3', x: -8, z: 31, roof: 'beige' },   // bege, embaixo no centro
    { id: 'C4', x: 23, z: 32, roof: 'beige' },   // bege, embaixo à direita
    { id: 'C5', x: 42, z: 18, roof: 'red' },     // vermelho, ilha do rio à direita
    { id: 'C6', x: 36, z: -11, roof: 'beige' }   // bege, no alto à direita
  ],
  fields: [
    { id: 'F1', x0: -56, x1: -45, z0: 17, z1: 22 },
    { id: 'F2', x0: 30, x1: 37, z0: -3, z1: 3 },
    { id: 'F3', x0: 42, x1: 53, z0: 26, z1: 31 },
    { id: 'F4', x0: -68, x1: -54, z0: -26, z1: -17 },
    { id: 'F5', x0: -52, x1: -42, z0: -36, z1: -28 },
    { id: 'F6', x0: -70, x1: -56, z0: -38, z1: -30 },
    { id: 'F7', x0: -36, x1: -22, z0: -46, z1: -40 },
    { id: 'F8', x0: 14, x1: 24, z0: -44, z1: -37 },
    { id: 'F9', x0: -60, x1: -48, z0: -48, z1: -42 }
  ],
  mountains: [
    { x: -82, z: -18, r: 13, h: 15 },  // pedras grandes à esquerda das plantações
    { x: -76, z: -1, r: 6, h: 7 },     // pedra solta à esquerda do acampamento vermelho
    { x: -74, z: -64, r: 22, h: 24 },  // picos ao fundo, esquerda
    { x: -40, z: -66, r: 18, h: 18 },
    { x: 34, z: -66, r: 18, h: 20 },   // pico ao fundo, centro
    { x: 56, z: -46, r: 18, h: 24 },   // maciço rochoso à direita do rio
    { x: 82, z: -40, r: 18, h: 20 },
    { x: 74, z: 0, r: 8, h: 8 },       // rochas da borda direita
    { x: 54, z: 36, r: 4.5, h: 4.5 },  // pedra grande embaixo à direita
    { x: -98, z: 10, r: 18, h: 12 },
    { x: 98, z: 30, r: 16, h: 10 }
  ],
  forests: [
    { x: -52, z: 42, r: 22, k: 1 },    // pinheiral embaixo à esquerda
    { x: -82, z: 30, r: 14, k: .9 },
    { x: 62, z: -8, r: 13, k: 1 },     // pinheiral à direita, atrás do acampamento vermelho
    { x: 46, z: -32, r: 10, k: .9 },
    { x: 58, z: 34, r: 9, k: .9 },     // mata embaixo à direita
    { x: -78, z: 8, r: 8, k: .8 },
    { x: -36, z: -40, r: 6, k: .7 },
    { x: -8, z: -40, r: 6, k: .6 },
    { x: 2, z: 46, r: 8, k: .8 },
    { x: 84, z: 18, r: 12, k: .9 }
  ],
  meadows: [
    { x: 22, z: 14, r: 6 }, { x: -30, z: 13, r: 6 }, { x: -46, z: 0, r: 7 }, { x: 28, z: -20, r: 6 },
    { x: -20, z: 26, r: 5 }, { x: 48, z: -1, r: 4 }, { x: -2, z: 37, r: 5 }, { x: 10, z: -26, r: 5 }
  ],
  /* postes com tocha ao longo da calçada (pares, um de cada lado) e a segunda escadaria */
  lamps: [[2, 17], [10, 22], [18, 28]],
  steps: { x: 10, z: 22, w: 6, n: 5 },
  spawn: [8, 23]
};


/* ===== v142 · MAPA AMPLIADO (de 200×112 para 300×168 blocos) =====
   O desenho original (vale com a casona) continua igual no centro; ao redor foram acrescentados novos rios, acampamentos,
   estradas, plantações, montanhas, florestas, prados, ruínas antigas e torres de vigia. */
LAYOUT.world = { w: 300, h: 168, hx: 150, hz: 84, block: 1 };
LAYOUT.rivers.push(
  { id: 'R5', hw: 3.0, pts: [[122, -92], [119, -62], [113, -40], [112, -18], [117, 4], [126, 26], [130, 48], [126, 70], [128, 96]] },
  { id: 'R6', hw: 2.6, pts: [[-128, -96], [-124, -68], [-116, -44], [-110, -22], [-114, 0], [-118, 25]] },
  { id: 'R7', hw: 1.8, pts: [[-66, 96], [-60, 72], [-54, 56], [-50, 44], [-46, 34]] },
  { id: 'R8', hw: 2.2, pts: [[70, 96], [72, 74], [78, 56], [90, 40], [106, 30], [124, 26]] }
);
LAYOUT.roads.push(
  { id: 'D10', kind: 'dirt', hw: 1.0, pts: [[-62, 8], [-70, -8], [-80, -26], [-90, -42]] },
  { id: 'D11', kind: 'dirt', hw: 1.0, pts: [[-42, 29], [-56, 36], [-72, 42], [-92, 48]] },
  { id: 'D12', kind: 'dirt', hw: 1.0, pts: [[-8, 34], [-12, 46], [-30, 58], [-56, 64], [-76, 64]] },
  { id: 'D13', kind: 'dirt', hw: 1.0, pts: [[26, 36], [30, 48], [38, 60], [46, 68]] },
  { id: 'D14', kind: 'dirt', hw: 1.0, pts: [[100, -23], [102, -34], [98, -44]] },
  { id: 'D15', kind: 'dirt', hw: 1.0, pts: [[46, 20], [60, 30], [76, 42], [92, 54]] },
  { id: 'D16', kind: 'dirt', hw: 1.0, pts: [[24, -48], [10, -58], [-2, -66]] },
  { id: 'D17', kind: 'dirt', hw: 1.0, pts: [[-92, -44], [-102, -34], [-112, -24], [-124, -16], [-134, -10]] }
);
LAYOUT.camps.push(
  { id: 'C7', x: -92, z: -44, roof: 'red' }, { id: 'C8', x: -100, z: 50, roof: 'teal' },
  { id: 'C9', x: -78, z: 64, roof: 'beige' }, { id: 'C10', x: 46, z: 70, roof: 'red' },
  { id: 'C11', x: 98, z: -46, roof: 'beige' }, { id: 'C12', x: 96, z: 56, roof: 'teal' },
  { id: 'C13', x: -136, z: -10, roof: 'beige' }, { id: 'C14', x: -6, z: -68, roof: 'teal' }
);
LAYOUT.fields.push(
  { id: 'F10', x0: -88, x1: -76, z0: -58, z1: -50 }, { id: 'F11', x0: -96, x1: -84, z0: 58, z1: 64 },
  { id: 'F12', x0: 30, x1: 40, z0: 62, z1: 67 }, { id: 'F13', x0: 104, x1: 114, z0: 62, z1: 68 },
  { id: 'F14', x0: 84, x1: 94, z0: -60, z1: -54 }, { id: 'F15', x0: -20, x1: -10, z0: -62, z1: -56 }
);
LAYOUT.mountains.push(
  { x: -130, z: -66, r: 24, h: 24 }, { x: -126, z: 56, r: 22, h: 18 }, { x: 128, z: -70, r: 22, h: 22 },
  { x: 134, z: 66, r: 20, h: 16 }, { x: -20, z: -82, r: 14, h: 10 }, { x: 14, z: 80, r: 16, h: 8 },
  { x: -96, z: 18, r: 10, h: 7 }, { x: 104, z: 10, r: 9, h: 6 }, { x: 80, z: -82, r: 18, h: 16 }, { x: -62, z: -84, r: 18, h: 14 }
);
LAYOUT.forests.push(
  { x: -110, z: -28, r: 14, k: 1 }, { x: -120, z: 40, r: 16, k: .9 }, { x: -88, z: 70, r: 12, k: .9 }, { x: -36, z: 70, r: 14, k: .9 },
  { x: 20, z: 76, r: 12, k: .8 }, { x: 74, z: 66, r: 12, k: .9 }, { x: 110, z: 70, r: 12, k: .9 }, { x: 136, z: -34, r: 13, k: 1 },
  { x: 84, z: -62, r: 12, k: .9 }, { x: 46, z: -66, r: 10, k: .8 }, { x: -60, z: -76, r: 10, k: .8 }, { x: -100, z: -62, r: 12, k: .9 },
  { x: -136, z: 24, r: 12, k: .9 }, { x: 100, z: 22, r: 10, k: .8 }
);
LAYOUT.meadows.push(
  { x: -70, z: -34, r: 6 }, { x: -100, z: 30, r: 6 }, { x: -48, z: 56, r: 6 }, { x: 0, z: 60, r: 6 },
  { x: 66, z: 40, r: 6 }, { x: 88, z: -8, r: 6 }, { x: 60, z: -48, r: 5 }, { x: -90, z: -6, r: 6 }
);
/* ruínas antigas (anel de pilares quebrados, muros baixos, pedras caídas e braseiro) e torres de vigia */
LAYOUT.ruins = [
  { x: -63, z: -44, rot: 0.4 }, { x: -24, z: -52, rot: 1.2 }, { x: 84, z: -15, rot: 0.2 }, { x: 88, z: 0, rot: 2 }, { x: -96, z: 40, rot: 0.9 }, { x: 22, z: 52, rot: 0.5 }, { x: 67, z: -64, rot: 2.6 }
];
LAYOUT.towers = [{ x: -39, z: -46 }, { x: 94, z: -27 }, { x: 114, z: 40 }, { x: -95, z: -8 }];
