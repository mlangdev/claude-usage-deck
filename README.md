# claude-usage-deck

🇧🇷 Português | [🇬🇧 English](README.en.md)

Mostra quanto falta da sua cota de uso do [Claude Code](https://claude.com/claude-code) (sessão atual e semana do plano Pro/Max) direto num botão de Stream Deck / Stream Dock — incluindo outras marcas (Redragon, Mirabox, etc.) que rodam o software **StreamDock**.

O projeto tem duas partes:

1. **`poller/`** — um serviço Node.js local, sem dependências, que roda `claude -p "/usage" --output-format json` periodicamente e expõe o resultado (já interpretado) num endpoint HTTP local. Essa chamada é gratuita: não gasta tokens nem conta como uma mensagem, é só uma consulta de status.
2. **`streamdock-plugin/`** — um plugin para o software **StreamDock** (usado por Stream Deck da Elgato e por várias outras marcas — Redragon Stream Station, Mirabox, etc.) com quatro teclas:
   - **Claude Usage** — gauge circular com o percentual usado (sessão ou semana), cores terracota/âmbar/vermelho conforme o consumo, e um alerta visual (`showAlert`) disparado automaticamente ao cruzar 90%.
   - **Claude Reset Countdown** — quanto tempo falta para a cota escolhida (sessão ou semana) resetar.
   - **Claude Stats** — quantos requests e sessões o Claude Code teve nas últimas 24h ou 7 dias.
   - **Claude Reset Day** — em qual dia da semana (e data) a cota escolhida (sessão ou semana) vai resetar.

> Este NÃO é um plugin oficial da Elgato nem da Anthropic. É uma ferramenta community-made que só lê a saída pública do comando `/usage` do Claude Code CLI.

## Como funciona

```
claude -p "/usage" --output-format json   (a cada N minutos)
        │
        ▼
   poller/ (Node.js, http://127.0.0.1:4756/usage)
        │
        ▼
   plugin StreamDock (poll a cada N segundos)
        │
        ▼
   tecla do Stream Deck mostra "SEMANA 4%" com barra colorida
```

## Pré-requisitos

- [Claude Code CLI](https://claude.com/claude-code) instalado e autenticado (`claude` precisa funcionar no terminal).
- Node.js 18+.
- Um Stream Deck (Elgato) ou um dispositivo de outra marca que rode o software **StreamDock** (procure por uma pasta `plugins` dentro da instalação do seu app — se tiver arquivos `.sdPlugin`, é esse SDK).

## 1. Rodar o poller

```bash
cd poller
npm install   # não tem dependências de terceiros, mas garante o cache do npm
npm start
```

Isso sobe um servidor em `http://127.0.0.1:4756/usage`. Teste no navegador ou com `curl`:

```bash
curl http://127.0.0.1:4756/usage
```

Você deve ver algo como:

```json
{
  "updatedAt": "2026-08-30T02:48:29.782Z",
  "metrics": [
    { "label": "Current session", "percentUsed": 12, "resetsAt": "Aug 30, 4:09am (America/Sao_Paulo)" },
    { "label": "Current week (all models)", "percentUsed": 4, "resetsAt": "Sep 4, 5:59am (America/Sao_Paulo)" }
  ],
  "error": null
}
```

### Configuração (opcional)

Copie `poller/.env.example` para `poller/.env` (ou exporte as variáveis direto no ambiente) para mudar:

- `PORT` — porta do servidor local (padrão `4756`)
- `POLL_INTERVAL_MS` — intervalo entre consultas ao `claude` CLI (padrão 5 minutos)
- `CLAUDE_BIN` — caminho/comando do executável do Claude Code, caso `claude` não esteja no PATH

### Rodar sempre em segundo plano

O jeito mais simples no Windows é criar um atalho que rode `npm start` dentro da pasta `poller` e colocar na pasta de Inicializar do Windows (`shell:startup`), ou usar um gerenciador de processos como [pm2](https://pm2.keymetrics.io/).

## 2. Instalar o plugin no StreamDock

1. Dentro de `streamdock-plugin/com.mlangdev.claudeusage.sdPlugin/plugin`, rode:

   ```bash
   npm install
   ```

   Isso baixa a única dependência do plugin (`ws`, para falar WebSocket com o StreamDock).

2. Copie a pasta inteira `com.mlangdev.claudeusage.sdPlugin` para a pasta de plugins do StreamDock:

   - Windows: `%AppData%\HotSpot\StreamDock\plugins\`
   - (Em builds rebrandadas — Redragon, etc. — o caminho real continua sendo esse `HotSpot\StreamDock`, mesmo que o app apareça com outro nome/ícone.)

3. Reinicie o app do Stream Deck/Stream Dock.

4. Procure a categoria **"Claude Usage"** na lista de ações — tem quatro teclas disponíveis (Claude Usage, Claude Reset Countdown, Claude Stats, Claude Reset Day). Arraste as que quiser pro seu painel.

5. Clique em cada tecla pra abrir o painel de configuração:
   - **Claude Usage**: métrica (sessão/semana), URL do poller, intervalo de atualização.
   - **Claude Reset Countdown**: métrica (sessão/semana), URL do poller, intervalo de atualização.
   - **Claude Stats**: janela (24h/7 dias), URL do poller, intervalo de atualização.
   - **Claude Reset Day**: métrica (sessão/semana), URL do poller, intervalo de atualização.

Pressionar qualquer uma das teclas força uma atualização imediata (o poller então reconsulta o `claude` CLI na hora).

### Sobre o countdown de reset

O texto do `/usage` não traz uma data completa (ex: "Aug 30, 4:09am"), então o poller assume que a hora mostrada está no mesmo fuso horário da máquina onde ele roda. Se você rodar o poller numa máquina/servidor em outro fuso, o countdown vai ficar errado — nesse caso essa tecla não é recomendada (o gauge e o stats continuam corretos, pois não dependem de fuso horário).

## Limitações conhecidas

- O `/usage` do Claude Code não é uma API pública documentada — é a saída de texto de um comando interativo. O parser (`poller/src/parseUsage.js`) é propositalmente tolerante, mas se a Anthropic mudar o texto do `/usage`, o parsing pode parar de reconhecer as linhas (o endpoint sempre devolve o texto bruto em `raw` pra você conferir).
- Os números refletem **sessões locais desta máquina** — não incluem uso de outros dispositivos ou do claude.ai (isso é uma limitação do próprio `/usage`, não do poller).
- Testado com o software **Redragon Stream Station** (rebrand do StreamDock da Mirabox/HotSpot). Deve funcionar em qualquer app baseado no mesmo SDK (procure pastas `.sdPlugin` na instalação), mas pode precisar de ajustes finos de manifest em versões diferentes do software.

## Licença

MIT — veja [LICENSE](LICENSE).
