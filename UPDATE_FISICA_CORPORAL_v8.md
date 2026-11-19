# CyberArena v8 — Física corporal híbrida e deformação de superfície

## O que foi acrescentado

- Camada contínua de tecido sob as placas do rig procedural (NEXUS e ATLAS), com pesos de skinning distribuídos entre quadril, coluna, peito, pescoço e cabeça.
- Deformação por vértice da superfície em impactos frontais, traseiros e laterais; a depressão localizada é restaurada gradualmente.
- CYBER usa a malha original esculpida: o LOD ativo é clonado por instância somente quando precisa ser deformado, preservando o asset compartilhado entre personagens.
- Pressão localizada de contato durante a captura da EXTINÇÃO SOLAR e a cotovelada do ABISMO ETERNO.
- Colisão corporal aproximada entre atores no plano de jogo: separação de cápsulas de tronco, transferência de impulso e resposta de impacto, sem atravessar um ao outro durante contatos normais.
- Reação elástica de peito, abdômen e cintura escapular reforçada; as deformações não dependem apenas da animação de dor.

## Limites técnicos

Este é um sistema híbrido procedural, não um solver FEM completo de músculo/pele nem um ragdoll integral. A colisão entre atores é uma aproximação por cápsulas no tronco; braços, mãos e pernas ainda usam rig e animação procedural. O CYBER tem uma malha contínua original e recebe deformação de vértices; NEXUS e ATLAS recebem uma camada contínua de tecido sob as peças rígidas e deformação por juntas/contato.

## Validação

A validação desta entrega inclui sintaxe JavaScript e integridade do ZIP. A renderização WebGL, desempenho em Android, qualidade visual das deformações e sincronização multiplayer precisam ser conferidos em execução no dispositivo/navegador.
