# CyberArena v137 — Lobby completo: Loja, Passe, Progressão, Caixa de Entrada, Amigos, Ranking, Configurações

## Corrigido
- **Missões**: a lista agora rola para baixo com o dedo (antes o toque só aceitava arrastar de lado).
- **Perfil**: o personagem é o mesmo 3D animado do lobby (liga só enquanto a tela do Perfil está aberta, para poupar bateria).

## Refeito
| Tela | O que mudou | Arquivos |
|---|---|---|
| Loja · Caixas | cartões com cor por tipo, chances por raridade, 5 marcas de "abertas hoje", barra de garantia (épico/lendário), botão "?" com a tela de chances nova; banner de 100 gemas grátis na linha do título | `ui2/shop2.js`, `ui2/shop2.css` |
| Loja · Recursos | 3 cartões (moedas, fichas, gemas) com saldo e para que servem + câmbio de gemas com atalhos 1/5/10/20/MÁX, prévia e limite do dia | idem |
| Passe | quadro de temporada: grátis em cima, nível no meio, premium embaixo; cartões grandes, brilho no que dá para coletar, "MEU NÍVEL", coletar tudo, comprar premium | `ui2/pass2.js`, `ui2/pass2.css` |
| Progressão | mesmo estilo, uma faixa só, páginas de 40 níveis, aviso da próxima caixa | idem |
| Caixa de Entrada | tipos: prêmio, código, evento, novidade, temporada, amigos, presente, compensação, sistema; filtros; "NOVO"; chips de recompensa; mensagem de novidades uma vez | `ui2/inbox2.js`, `ui2/inbox2.css` |
| Ranking | pódio dos 3 primeiros, seu cartão no topo, tela amigável sem conexão com "tentar de novo" | `lobby3d.js` |
| Amigos | duas etapas (criar código / entrar com código), servidor avançado escondido | `lobby3d.js` |
| Configurações | duas colunas, cabeçalho fixo, rola com o dedo | `ui2/inbox2.css` |

Para mandar uma mensagem ao jogador de qualquer lugar do código:
`pushInbox({type:'event', title:'…', body:'…', rewards:[{kind:'coins',amount:100}]})`

## Testado (Chromium headless, tela 844×390)
Capturas de todas as telas; abrir Mini Caixa; câmbio de gemas; coletar recompensa do Passe e da Progressão; Caixa de Entrada; Perfil 3D liga e desliga; ranking com dados simulados. Sem erros no console.

## Não testado
- Celular real: toque, tamanho dos botões, sons e vibração (não dá para ouvir/sentir aqui).
- Ranking com servidor de verdade (só simulado).
- Modo online remoto (`cyberRemoteMode`): as telas novas só mudam o visual; coletar usa as mesmas funções de antes.
- Amigos/Ranking/Configurações foram revisados no visual; a lógica de grupo (`party.js`) não foi mexida.
