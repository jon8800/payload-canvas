'use client'

// "Use Claude Code or Codex": connect the official CLIs (signed in with a Claude Pro/Max or
// ChatGPT plan) to this site's MCP endpoint. They edit pages through the live channel, so changes
// appear in the open editor. Subscriptions are never used as API keys: the CLIs are the MCP clients.

import { useConfig } from '@payloadcms/ui'
import { useEffect, useId, useState, type KeyboardEvent } from 'react'

import { Icon } from '../icons'

/** The API key collection of payload-mcp-toolkit. */
const MCP_KEYS_SLUG = 'payload-mcp-api-keys'
const SERVER_NAME = 'payload-builder'
const KEY_ENV = 'PAYLOAD_MCP_KEY'
type Agent = 'claude' | 'codex'
const AGENTS: { id: Agent; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
]
export const CONNECT_DOCS = 'https://github.com/jon8800/payload-toolkit/blob/main/docs/ai/connect-claude-code-and-codex.md'

export function ConnectAgents({ onClose }: { onClose?: () => void }) {
  const { config } = useConfig()
  const admin = config.routes?.admin ?? '/admin'
  const api = config.routes?.api ?? '/api'
  // The server URL when configured, else this browser's origin. The card renders only after a click
  // or a failed request, so never during server rendering.
  const origin = config.serverURL || (typeof window === 'undefined' ? '' : window.location.origin)
  const hasMcp = config.collections.some((c) => c.slug === MCP_KEYS_SLUG)
  const url = `${origin}${api}/mcp`
  const [agent, setAgent] = useState<Agent>('claude')
  const baseId = useId()
  const tabId = (id: Agent) => `${baseId}-tab-${id}`
  const panelId = `${baseId}-panel`

  // Arrow keys move between the two tabs, as in any tab list.
  const onTabKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const next = AGENTS[e.key === 'Home' ? 0 : e.key === 'End' ? AGENTS.length - 1 : (AGENTS.findIndex((a) => a.id === agent) + (e.key === 'ArrowRight' ? 1 : -1) + AGENTS.length) % AGENTS.length].id
    setAgent(next)
    document.getElementById(tabId(next))?.focus()
  }

  const claude = `claude mcp add --transport http ${SERVER_NAME} ${url} --header "Authorization: Bearer <key>"`
  const codex = `codex mcp add ${SERVER_NAME} --url ${url} --bearer-token-env-var ${KEY_ENV}`
  const codexToml = `[mcp_servers.${SERVER_NAME}]\nurl = "${url}"\nbearer_token_env_var = "${KEY_ENV}"`

  return (
    <section className="builder-assistant__card builder-assistant__connect" aria-label="Use Claude Code or Codex">
      <div className="builder-assistant__connect-head">
        <p className="builder-assistant__card-title">Use Claude Code or Codex</p>
        {onClose && (
          <button type="button" className="builder-editor__icon-button builder-editor__icon-button--small" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
      <p className="builder-assistant__card-text">
        Claude Code and Codex run on your Claude Pro/Max or ChatGPT plan, with no API key. They connect to this site over MCP.
        Each change they make appears in this editor as it happens.
      </p>
      {!hasMcp ? (
        <p className="builder-assistant__card-text">
          This site has no MCP endpoint yet. Add <code>payload-mcp-toolkit</code> with <code>builderMcpTools()</code>, as the guide shows.
        </p>
      ) : (
        <>
          <div className="builder-assistant__step">
            <span className="builder-assistant__step-title">1. Create an MCP API key</span>
            <span className="builder-assistant__step-text">Pick the Editor preset. The key shows only once: copy it.</span>
            <a className="builder-assistant__link" href={`${admin}/collections/${MCP_KEYS_SLUG}/create`} target="_blank" rel="noopener noreferrer">
              MCP → API Keys <Icon name="external" size={12} />
            </a>
          </div>
          <div className="builder-assistant__step">
            <span className="builder-assistant__step-title">2. Add this site to your tool</span>
            <div className="builder-editor__segmented builder-editor__segmented--full" role="tablist" aria-label="Tool">
              {AGENTS.map((a) => (
                <button
                  key={a.id}
                  id={tabId(a.id)}
                  type="button"
                  role="tab"
                  className="builder-editor__segment"
                  aria-selected={agent === a.id}
                  aria-controls={panelId}
                  tabIndex={agent === a.id ? 0 : -1}
                  onClick={() => setAgent(a.id)}
                  onKeyDown={onTabKeyDown}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div id={panelId} role="tabpanel" aria-labelledby={tabId(agent)} className="builder-assistant__tabpanel">
              {agent === 'claude' ? (
                <>
                  <span className="builder-assistant__step-text">Run this. Put your key in place of &lt;key&gt;.</span>
                  <CopyCode code={claude} label="Copy the Claude Code command" />
                </>
              ) : (
                <>
                  <span className="builder-assistant__step-text">
                    Put the key in the <code>{KEY_ENV}</code> environment variable. Then run this.
                  </span>
                  <CopyCode code={codex} label="Copy the Codex command" />
                  <span className="builder-assistant__step-text">
                    Or add this to <code>~/.codex/config.toml</code>.
                  </span>
                  <CopyCode code={codexToml} label="Copy the Codex config" />
                </>
              )}
            </div>
          </div>
        </>
      )}
      <p className="builder-assistant__card-text">
        Then ask, for example: “Use payload-builder to add a pricing section to this page.”
      </p>
      <div className="builder-assistant__card-actions">
        <a className="builder-assistant__link" href={CONNECT_DOCS} target="_blank" rel="noopener noreferrer">
          Guide, and Claude.ai / ChatGPT sign-in <Icon name="external" size={12} />
        </a>
      </div>
    </section>
  )
}

/** Copies text to the clipboard; `copied` is true for 1.5 s after. */
export function useCopy(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])
  return { copied, copy: (text) => void navigator.clipboard?.writeText(text).then(() => setCopied(true)) }
}

function CopyCode({ code, label }: { code: string; label: string }) {
  const { copied, copy } = useCopy()
  return (
    <div className="builder-assistant__copy-code">
      <pre className="builder-assistant__card-code">{code}</pre>
      <button
        type="button"
        className="builder-editor__icon-button builder-editor__icon-button--small"
        aria-label={copied ? 'Copied' : label}
        data-tooltip={copied ? 'Copied' : 'Copy'}
        onClick={() => copy(code)}
      >
        <Icon name={copied ? 'check' : 'copy'} size={13} />
      </button>
    </div>
  )
}
