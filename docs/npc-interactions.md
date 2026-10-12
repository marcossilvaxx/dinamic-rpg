# Comunicação e interação entre NPCs

> **Status:** todas as fases estão implementadas. A fase 1 foi direto para a geração com LLM, sem as falas fixas. Na fase 5, os pontos de interesse ficam em `src/levels/places.js` e a ferramenta de apresentar se chama `introducePlayerTo(villager)`. Os nomes de arquivos e funções abaixo correspondem ao código.

Objetivo: deixar o mundo mais vivo, com NPCs que se encontram pelo mapa, conversam entre si (com balões de fala visíveis), **lembram** dessas conversas e das conversas com o jogador, e mudam de comportamento por causa disso (andar juntos, ir até alguém, espalhar boatos).

Este documento parte da arquitetura atual:

| Peça | Onde | Papel na feature |
| --- | --- | --- |
| `GameSession` | `backend/game/GameSession.js` | Dono dos NPCs de uma conexão; vai orquestrar as conversas NPC↔NPC |
| `NpcAgent` | `backend/agents/NpcAgent.js` | Persona + memória de chat; ganha memória de longo prazo |
| `SessionStore` | `backend/storage/SessionStore.js` | Redis com namespace por sessão; ganha relações e fatos |
| `LlmClient.complete` | `backend/llm/client.js` | Chamada com structured output (`schema`) |
| `protocol.js` | `backend/protocol.js` e `frontend/src/net/protocol.js` | Novos tipos de mensagem |
| `gameSocket` | `frontend/src/net/socket.js` | Roteia mensagens por `agentId` |
| `Npc` | `frontend/src/objects/Npc/index.js` | Já tem `follow(target)` para qualquer `GameObject`, `cancelPath`, `moveTo` |
| `SpeechBubble` | `frontend/src/objects/SpeechBubble/index.js` | Balões temporários (`time`) ou persistentes |

## Visão geral do fluxo

```
Frontend (posições)                         Backend (LLM + memória)
───────────────────                         ───────────────────────
NpcDirector detecta A e B próximos
  A, B → estado NPC_TALKING (param, se viram)
  ── npc_encounter {a, b} ───────────────▶  GameSession.startNpcConversation
                                              lê personas, relação, fatos
                                              1 chamada LLM (structured output)
                                              salva memórias + relação
  ◀── npc_dialogue {conversationId, lines, outcome} ──
reproduz linhas em SpeechBubbles
aplica outcome (follow, go_to, ...)
A, B → voltam a vagar
```

## Fase 1: encontros e protocolo (sem LLM)

**Frontend: `src/systems/NpcDirector.js`** (um `GameObject` adicionado ao `mainScene`)
- A cada ~1 s (acumulando `delta` no `step`), percorre os pares de NPCs livres: sem estar falando com o jogador, sem conversar com outro NPC e sem seguir ninguém.
- Um encontro acontece quando a distância é ≤ 2 tiles, os dois estão fora do cooldown individual (`NPC_CHAT_COOLDOWN_MS`, ~60 s) e o par está fora do cooldown de par (~3 min), e `Math.random() < NPC_CHAT_CHANCE`.
- Limite global de cenas simultâneas: `MAX_NPC_CONVERSATIONS` (1–2), para controlar o custo.
- Ao disparar: `npc.startNpcConversation(other)` cancela o caminho (`cancelPath`) e vira o NPC para o outro (com `nextDirection`). O director então envia `npc_encounter`.

**Novos estados no `Npc`**: `isTalking` (com o jogador) e `npcConversation` (id da cena atual). Quando `npcConversation` está ativo, o `step` só anima parado, como já acontece com `isTalking`.

**Protocolo** (adicionar nos dois `protocol.js`):
- Cliente → servidor: `npc_encounter` `{ data: { a, b } }` e `npc_conversation_abort` `{ data: { conversationId, shownLines } }`
- Servidor → cliente: `npc_dialogue` `{ data: { conversationId, a, b, lines, outcome } }`

Para validar a fase, o backend responde com falas fixas (mock), o que permite testar movimento, balões e cooldowns sem gastar tokens.

## Fase 2: conversa gerada pelo LLM

**Backend: `backend/game/NpcConversation.js`**, chamado por `GameSession.startNpcConversation(a, b)`.

A cena inteira sai de **uma única chamada** ao LLM (um "diretor de cena"), em vez de um agente por turno. É mais barato (1 chamada contra 4–8), mais coerente e tem menos latência.

O prompt (`backend/prompts/npcConversation.js`) recebe:
- persona dos dois (`name`, `personality`, `story`)
- história do mundo
- relação atual (afinidade e resumo do último encontro)
- os fatos recentes que cada um conhece (Fase 3)

Structured output (`schema` do `LlmClient.complete`):

```json
{
  "lines": [{ "speaker": "a", "text": "...", "emotion": "neutral" }],
  "outcome": { "action": "none", "target": null },
  "memories": { "a": "o que A vai lembrar", "b": "o que B vai lembrar" },
  "affinityDelta": 0
}
```

- `lines`: entre 2 e 6 falas curtas (cabem num balão).
- `speaker`: `"a" | "b"`; `emotion`: `neutral | happy | angry | sad | surprised` (no futuro pode virar um ícone no balão).
- `outcome.action`: `none | walk_together | go_to_player | avoid`; `target`: `"a" | "b" | null`.
- `affinityDelta`: inteiro de -2 a 2.

**Frontend: reprodução da cena**
- As linhas são mostradas em sequência com `new SpeechBubble(0, y, text)`, que já usa `getMillisecondsToReadText` para a duração. A próxima linha só aparece quando a anterior some.
- Os balões são curtos: quebrar ou truncar o texto (ou aumentar a largura máxima do `SpeechBubble`).
- No fim, aplicar `outcome`:
  - `walk_together`: `a.follow(b)` por um tempo limitado. Funciona porque o `follow()` aceita qualquer `GameObject`.
  - `go_to_player`: `npc.follow(scene.player)` até encostar e então mostrar um balão chamando o jogador.
  - `avoid`: `moveTo` para longe do outro NPC.
- Opcional: se o jogador estiver a até ~5 tiles, as falas também entram num log lateral (o jogador "escuta").

## Fase 3: memória de longo prazo, relações e fofoca

**Storage** (novos métodos no `SessionStore`):
- `session:{sid}:rel:{min(a,b)}:{max(a,b)}` → `{ affinity, lastTalkSummary, talks }`
- `session:{sid}:npc:{id}` campo `facts` → lista de até ~20 fatos curtos. Quando passar do limite, descartar os mais antigos (ou resumir em um só).

**De onde vêm os fatos**
1. Conversas NPC↔NPC: `memories.a` e `memories.b` da Fase 2.
2. Conversas com o jogador: quando o chat termina (tool `endConversation`, tecla Q ou o jogador se afastar), o front envia `chat_closed`. O backend faz uma chamada barata que resume os turnos novos da memória do `NpcAgent` em 1 fato ("O jogador disse que procura o colar perdido de Joseph").

**Como os fatos são usados**
- No prompt de diálogo com o jogador (`npcDialogPrompt`), uma nova seção "Pessoas que você conhece e o que ouviu recentemente" lista as relações e os fatos. Assim o NPC pode comentar algo que ouviu de outro NPC.
- No prompt da cena NPC↔NPC, os fatos de cada participante entram como "coisas que você poderia comentar". É assim que a **fofoca** se espalha: o jogador conta algo para A, A conta para B, e depois B comenta com o jogador.

## Fase 4: interrupção pelo jogador e polimento

- Se o jogador apertar **E** perto de um NPC em cena, a cena é cancelada: o front envia `npc_conversation_abort` com as linhas já exibidas, o backend grava em `memories` só o que foi dito, e o NPC abre o chat. Uma linha no prompt de sistema indica que ele foi interrompido conversando com X.
- O `NpcDirector` não inicia cenas com NPCs que estão na tela do chat ou seguindo o jogador.
- Métricas no console do backend: cenas por minuto e tokens por cena, para calibrar `NPC_CHAT_CHANCE` e os cooldowns.

## Fase 5 (opcional): rotinas e eventos do mundo

- Pontos de interesse (praça, mercado, poço) marcados num arquivo `src/levels/pois.js`. NPCs com "rotina" alternam entre POIs em vez de vagar aleatoriamente, o que aumenta a chance de encontros naturais.
- Novas tools no chat do jogador: `introducePlayerTo(npcName)`, que leva o jogador até outro NPC, e `guidePlayerTo(place)`.
- Eventos periódicos do mundo gerados pelo LLM ("um mercador chegou à vila") e injetados como fato em todos os NPCs.

## Fase 6: o jogador no centro das conversas

- **Fofoca sobre o jogador:** a cena NPC↔NPC recebe a opinião de cada um sobre o viajante e devolve `aboutTraveler`. Quando eles falam do jogador, `hearsayChange` (em `game/hearsay.js`) aproxima a opinião de quem ouviu da de quem falou, em até 2 pontos. NPCs que nunca viram o jogador podem ir atrás dele por curiosidade ou para tirar satisfação.
- **Escutar escondido:** o `NpcDirector` envia `isPrivate` no `npc_encounter` quando o jogador não pode ser visto (mais longe que `seenDistance`). Em cenas privadas o prompt libera segredos, opiniões sinceras e um deslize do culpado do mistério (`Mystery.slipFor`). Se o jogador ouviu alguma fala e chega perto demais, a cena para e o `npc_conversation_end` vai com `noticedPlayer`: os dois lembram e a reputação cai 1 ponto com cada um.
- **NPCs que procuram o jogador:** o servidor envia `npc_seeks_player` (pistas para quem gosta de você, lembretes de prazo, curiosidade após fofoca). O `SeekPlanner` permite um NPC por vez, com intervalo mínimo, e guarda o motivo para a saudação.
- **Saudação:** ao abrir o chat, o cliente envia `chat_opened`. Se há motivo (procurou o jogador, pedido em andamento ou conversa anterior), o NPC fala primeiro, lembrando o que conversaram.

## Fase 7: vida própria da vila

- **Pazes:** quando dois NPCs viram inimigos, `Quests.createPeaceRequest` cria um pedido do tipo `peace`. Um deles pede ajuda ao jogador e o outro conclui o pedido (`completeQuest`) quando é convencido. Aí `NpcSocial.makePeace` devolve a afinidade ao neutro.
- **Família:** todo dia às 7h, `FamilyLife` verifica os pares. Afinidade 8 ou mais e várias conversas levam a namoro, depois a noivado; o casamento vira a festa do dia (`VillageLife.planWedding`) e, depois dele, vem a mudança de casa (`npc_updated`) e um filho. Se a afinidade cair, o casal termina.
- **Sonhos:** cada NPC tem uma meta (`Goals`), que entra nos prompts de diálogo e de conversa, ou seja, também é assunto entre eles.
- **Visitantes:** NPCs de um dia (`Visitors`, ids a partir de 100) conversam com os moradores como qualquer NPC, mas ficam fora do elenco, para não mudar o contexto em cache, e fora dos mistérios.

## Testes

- Backend (`node --test`): `NpcConversation` com `LlmClient` falso, validando o schema, a gravação de memórias e o cálculo de afinidade com limite. Também o limite e a poda de fatos no `SessionStore`, usando um Redis falso (objeto com `hGet`/`hSet`/`del`).
- Frontend: a regra de seleção de pares do `NpcDirector` (distância, cooldowns, limite de cenas) como função pura testável com `node --test`.
- Manual: com `NPC_CHAT_CHANCE = 1` e cooldowns baixos, verificar que os balões aparecem, que a cena termina, que o `outcome` é aplicado e que, ao falar com o NPC depois, ele menciona a conversa.

## Custos

Com 5 NPCs, `NPC_CHAT_CHANCE` em ~0.3 e cooldown de 60 s, o esperado é no máximo algumas cenas por minuto. Isso dá 1 chamada por cena mais 1 chamada barata de resumo por chat com o jogador. O `MAX_NPC_CONVERSATIONS` é o limite rígido.
