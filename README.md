# claude-usage-deck

Mostra quanto falta da sua cota de uso do [Claude Code](https://claude.com/claude-code) (sessão atual e semana do plano Pro/Max) direto num botão de Stream Deck / Stream Dock — incluindo os clones baratos (Redragon, Mirabox, etc.) que rodam o software **StreamDock**.

O projeto tem duas partes:

1. **`poller/`** — um serviço Node.js local, sem dependências, que roda `claude -p "/usage" --output-format json` periodicamente e expõe o resultado (já interpretado) num endpoint HTTP local. Essa chamada é gratuita: não gasta tokens nem conta como uma mensagem, é só uma consulta de status.
2. **`streamdock-plugin/`** — um plugin para o software **StreamDock** (usado por Stream Deck da Elgato e por vários clones — Redragon Stream Station, Mirabox, etc.) que lê o endpoint do poller e mostra o percentual usado direto na tecla, com uma barra colorida (verde/amarelo/vermelho conforme o consumo).

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
- Um Stream Deck (Elgato) ou um clone que rode o software **StreamDock** (procure por uma pasta `plugins` dentro da instalação do seu app — se tiver arquivos `.sdPlugin`, é esse SDK).

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

4. Procure a ação **"Claude Usage"** na lista de ações (categoria "Claude Usage") e arraste pra uma tecla.

5. Clique na tecla pra abrir o painel de configuração e ajuste se quiser:
   - **Métrica**: sessão atual ou semana (cota do plano)
   - **URL do poller**: só muda se você alterou a porta no `.env`
   - **Intervalo de atualização**: a cada quantos segundos o plugin reconsulta o poller

Pressionar a tecla força uma atualização imediata (o poller então reconsulta o `claude` CLI na hora).

## Limitações conhecidas

- O `/usage` do Claude Code não é uma API pública documentada — é a saída de texto de um comando interativo. O parser (`poller/src/parseUsage.js`) é propositalmente tolerante, mas se a Anthropic mudar o texto do `/usage`, o parsing pode parar de reconhecer as linhas (o endpoint sempre devolve o texto bruto em `raw` pra você conferir).
- Os números refletem **sessões locais desta máquina** — não incluem uso de outros dispositivos ou do claude.ai (isso é uma limitação do próprio `/usage`, não do poller).
- Testado com o software **Redragon Stream Station** (rebrand do StreamDock da Mirabox/HotSpot). Deve funcionar em qualquer app baseado no mesmo SDK (procure pastas `.sdPlugin` na instalação), mas pode precisar de ajustes finos de manifest em versões diferentes do software.

## Licença

MIT — veja [LICENSE](LICENSE).
