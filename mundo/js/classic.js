/* CyberArena · personagens (v146) — SOMENTE os 3 personagens novos: Atlas, Nexus e Cyber.
   Cada um é um GLB riggado (mundo/models/<id>_rig.glb, esqueleto com dedos e 72–79 animações GRAVADAS dentro do arquivo) baixado pelo lobby (ver packs.js).
   Não existe mais nenhum corpo, malha ou animação de personagem antigo no projeto: se o GLB pedido ainda não carregou,
   o jogo usa outro dos 3 novos que esteja carregado, nunca um modelo antigo. O Hero (hero.js) é só o motor de estado/ações/contato. */
import { Hero } from './hero.js';
import { riggedReady, buildRigged, loadRigged } from './riggedglb.js';

export const RIG_IDS = ['cyber', 'nexus', 'atlas'];
const POSE = { cyber: [-.3, -.15], nexus: [-.38, -.2], atlas: [-.5, -.28] };   // inclinação de cabeça/pescoço de cada rig

export const loadNexusRig = () => loadRigged('nexus');
export const loadClassic = () => loadRigged('cyber');
export const classicReady = () => riggedReady('cyber');
export const atlasGLBReady = () => riggedReady('atlas');
/* carrega os 3 que estiverem baixados (os que faltam só avisam; o lobby/JOGAR exigem o pacote do personagem escolhido) */
export const loadAtlasGLB = () => Promise.all(RIG_IDS.map(id => loadRigged(id).catch(e => console.warn(id + ' rig', e.message))));

export function makeCharacter(charId, skinId) {
  const id = riggedReady(charId) ? charId : RIG_IDS.find(riggedReady);
  if (!id) { const e = new Error('personagem não carregado: ' + charId); e.need = true; throw e; }
  const h = new Hero(id === 'atlas' && skinId === 'cyber' ? 'ouro' : skinId); h.charId = id;
  for (const mesh of h.skinned || []) mesh.visible = false;
  if (h.softShell) h.softShell.visible = false; if (h.chainMeshes) h.chainMeshes.visible = false; if (h.knuckleGlow) h.knuckleGlow.visible = false;
  for (const f of h.fingers || []) { f.a.visible = false; }
  h.headPitch = POSE[id][0]; h.neckPitch = POSE[id][1];
  buildRigged(h, id);
  return h;
}
