/* CyberArena · Mapa do Vale (layout fiel à arte de referência).
   Eixos: X leste, Z sul (a câmera inicial olha para o norte, como na arte). Unidade = 1 bloco.
   - Casona (templo de cúpula) ao norte do centro, escadaria virada para o sul.
   - Estrada de pedra desce em diagonal, passa por uma segunda escadaria (terraço) e cruza o rio do sul.
   - Rio principal vem do norte, desce a leste da casona e vira para o leste; um braço volta em laço e desce ao sul.
   - Rio do oeste entra pela borda oeste e desce para o sul; um riacho nasce entre as flores e se junta a ele.
   - Seis acampamentos (vermelho O, azul SO, bege S, bege SE, vermelho L, bege NE), plantações, prados floridos,
     pinheirais densos no SO, no L e no SE, montanhas rochosas a NO, N e NE. */
window.CW = window.CW || {};
CW.LAYOUT = {
  world: { w: 200, h: 112, block: 1 },
  temple: { x: -8, z: -34, platformR: 18 },
  terrace: { x: 12, z: 12, nx: 0.62, nz: 0.78, h: 1.4, cx: 0, cz: -12, r0: 34, r1: 54 },
  rivers: [
    { id: 'R1', hw: 3.2, pts: [[14, -96], [16, -80], [20, -66], [27, -54], [33, -40], [37, -26], [39, -13], [48, -6], [66, -3], [88, 1], [104, 3], [118, 4]] },
    { id: 'R2', hw: 2.6, pts: [[86, 1], [85, 12], [74, 22], [56, 26], [40, 27], [28, 29], [21, 35], [17, 46], [14, 60], [12, 80]] },
    { id: 'R3', hw: 2.7, pts: [[-122, 25], [-100, 26], [-84, 27], [-70, 26], [-56, 28], [-43, 35], [-32, 43], [-26, 52], [-24, 80]] },
    { id: 'R4', hw: 1.5, pts: [[-20, 2], [-15, 12], [-17, 24], [-22, 35], [-30, 44]] }
  ],
  roads: [
    { id: 'main', kind: 'cobble', hw: 1.9, pts: [[-8, -12], [-6, -5], [3, 3], [12, 12], [17, 20], [20, 28], [22, 34], [23, 40]] },
    { id: 'Dw', kind: 'dirt', hw: 1.0, pts: [[3, 3], [-4, 13], [-28, 17], [-46, 11], [-60, 1], [-73, -12], [-82, -26], [-70, -42], [-58, -50]] },
    { id: 'Dn', kind: 'dirt', hw: 1.0, pts: [[-60, 1], [-50, -14], [-38, -22], [-30, -36]] },
    { id: 'Dwc', kind: 'dirt', hw: 0.9, pts: [[-75, 4], [-62, 2]] },
    { id: 'Dne', kind: 'dirt', hw: 1.0, pts: [[-1, -3], [14, -9], [30, -14], [46, -20], [60, -28], [78, -32], [100, -38]] },
    { id: 'Dnc', kind: 'dirt', hw: 0.9, pts: [[60, -28], [60, -31]] },
    { id: 'De', kind: 'dirt', hw: 1.0, pts: [[62, 12], [46, 18], [30, 22], [17, 21]] },
    { id: 'Dse', kind: 'dirt', hw: 1.0, pts: [[23, 40], [33, 41], [42, 52], [46, 60]] },
    { id: 'Ds', kind: 'dirt', hw: 1.0, pts: [[23, 40], [10, 38], [-2, 40], [-10, 52], [-12, 60]] },
    { id: 'Dsw', kind: 'dirt', hw: 1.0, pts: [[-4, 13], [-18, 21], [-30, 23], [-38, 23]] }
  ],
  camps: [
    { id: 'W', x: -77, z: 5, roof: 'red' },
    { id: 'SW', x: -41, z: 21, roof: 'teal' },
    { id: 'S', x: -3, z: 44, roof: 'beige' },
    { id: 'SE', x: 36, z: 44, roof: 'beige' },
    { id: 'E', x: 63, z: 13, roof: 'red' },
    { id: 'NE', x: 60, z: -36, roof: 'beige' }
  ],
  fields: [
    { id: 'Fw', x0: -68, x1: -54, z0: 12, z1: 20 },
    { id: 'Fne', x0: 64, x1: 78, z0: -22, z1: -12 },
    { id: 'Fse', x0: 52, x1: 70, z0: 32, z1: 41 },
    { id: 'Fnw1', x0: -96, x1: -80, z0: -55, z1: -46 },
    { id: 'Fnw2', x0: -78, x1: -64, z0: -60, z1: -50 },
    { id: 'Fnw3', x0: -60, x1: -46, z0: -64, z1: -56 },
    { id: 'Fnw4', x0: -92, x1: -78, z0: -66, z1: -58 },
    { id: 'Fn', x0: 34, x1: 50, z0: -58, z1: -48 }
  ],
  meadows: [
    { x: -40, z: -4, r: 15 }, { x: -22, z: -8, r: 9 }, { x: 24, z: -26, r: 9 }, { x: -52, z: -30, r: 10 },
    { x: 46, z: -4, r: 6 }, { x: -12, z: 26, r: 7 }, { x: 50, z: 24, r: 5 }
  ],
  forests: [
    { x: -80, z: 46, r: 30, k: 1.2 }, { x: -52, z: 52, r: 14, k: .9 }, { x: 92, z: -16, r: 20, k: 1.1 }, { x: 80, z: 46, r: 20, k: 1 },
    { x: -4, z: 56, r: 10, k: .5 }, { x: -92, z: -32, r: 12, k: .7 }, { x: 40, z: -44, r: 10, k: .8 }, { x: -28, z: -58, r: 12, k: .6 },
    { x: 98, z: 24, r: 10, k: .7 }
  ],
  boulders: [
    { x: -100, z: -14, s: 3.2 }, { x: -92, z: -40, s: 4.2 }, { x: -60, z: -16, s: 1.8 }, { x: 86, z: 48, s: 3 },
    { x: 49, z: 6, s: 1.6 }, { x: -31, z: -6, s: 1.3 }, { x: 31, z: 8, s: 1.4 }, { x: -12, z: 8, s: 1.1 }, { x: 74, z: 4, s: 1.4 }
  ],
  mountains: [
    { x: 88, z: -52, r: 32, h: 28 }, { x: -96, z: -58, r: 30, h: 24 }, { x: -108, z: -22, r: 14, h: 10 }, { x: 116, z: -22, r: 22, h: 16 },
    { x: -36, z: -80, r: 34, h: 14 }, { x: 52, z: -80, r: 26, h: 16 }, { x: 102, z: 54, r: 14, h: 7 }, { x: -104, z: 56, r: 16, h: 8 }
  ]
};
