import { Key, Plus, RefreshCw, Settings, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MarketplaceSource } from '@shared/marketplace/types';
import { rpc } from '@renderer/lib/ipc';
import { Input } from '@renderer/lib/ui/input';
import { Separator } from '@renderer/lib/ui/separator';
import { Switch } from '@renderer/lib/ui/switch';

interface SourceFormData {
  name: string;
  url: string;
  kind: 'mcp' | 'skill';
  type: string;
}

interface EditSourceState {
  id: string;
  name: string;
  token: string;
  authType: 'none' | 'github-token' | 'bearer';
}

function inferTypeFromUrl(url: string): string {
  if (url.includes('smithery')) return 'smithery';
  if (url.includes('glama')) return 'glama';
  if (url.includes('mcp.so')) return 'mcp-so';
  return 'json-feed';
}

function inferKindFromType(type: string): 'mcp' | 'skill' {
  if (['github-repo', 'openai-skills', 'anthropic-skills'].includes(type)) return 'skill';
  return 'mcp';
}

export function MarketplacesCard() {
  const { t } = useTranslation();
  const [sources, setSources] = useState<MarketplaceSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSource, setEditingSource] = useState<EditSourceState | null>(null);
  const [formData, setFormData] = useState<SourceFormData>({
    name: '',
    url: '',
    kind: 'mcp',
    type: 'json-feed',
  });

  const loadSources = useCallback(async () => {
    try {
      const result = await rpc.marketplace.getSources();
      if (result.success && result.data) {
        setSources(result.data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await rpc.marketplace.toggleSource({ id, enabled });
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
    } catch {
      // Silently fail
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await rpc.marketplace.refreshMcp();
      await loadSources();
    } catch {
      // Silently fail
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddSource = async () => {
    if (!formData.name || !formData.url) return;

    const type = formData.type || inferTypeFromUrl(formData.url);
    const kind = formData.kind || inferKindFromType(type);
    const newSource: MarketplaceSource = {
      id: `custom-${Date.now()}`,
      name: formData.name,
      kind,
      url: formData.url,
      type: type as MarketplaceSource['type'],
      enabled: true,
      builtin: false,
    };

    try {
      const updated = [...sources, newSource];
      await rpc.marketplace.saveSources({ sources: updated });
      setSources(updated);
      setShowAddForm(false);
      setFormData({ name: '', url: '', kind: 'mcp', type: '' });
    } catch {
      // Silently fail
    }
  };

  const handleRemoveSource = async (id: string) => {
    const source = sources.find((s) => s.id === id);
    if (!source || source.builtin) return;

    try {
      const updated = sources.filter((s) => s.id !== id);
      await rpc.marketplace.saveSources({ sources: updated });
      setSources(updated);
    } catch {
      // Silently fail
    }
  };

  const openEditSource = (source: MarketplaceSource) => {
    setEditingSource({
      id: source.id,
      name: source.name,
      token: source.auth?.token ?? '',
      authType: source.auth?.type ?? 'none',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingSource) return;

    const updated = sources.map((s) => {
      if (s.id !== editingSource.id) return s;
      const newSource = { ...s };
      if (editingSource.authType === 'none' || !editingSource.token) {
        delete newSource.auth;
      } else {
        newSource.auth = { type: editingSource.authType, token: editingSource.token };
      }
      return newSource;
    });

    try {
      await rpc.marketplace.saveSources({ sources: updated });
      setSources(updated);
      setEditingSource(null);
    } catch {
      // Silently fail
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/10 p-4 text-sm text-foreground-muted">
        Loading marketplace sources...
      </div>
    );
  }

  const mcpSources = sources.filter((s) => s.kind === 'mcp');
  const skillSources = sources.filter((s) => s.kind === 'skill');

  const renderSourceList = (items: MarketplaceSource[], title: string) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      <div className="space-y-2">
        {items.map((source) => (
          <div
            key={source.id}
            className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2"
          >
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">{source.name}</span>
                {source.builtin && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                    Built-in
                  </span>
                )}
                {source.auth?.token && (
                  <span className="flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-500">
                    <Key className="h-2.5 w-2.5" />
                    Authenticated
                  </span>
                )}
              </div>
              {source.url && (
                <span className="truncate text-xs text-foreground-muted/70">{source.url}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => openEditSource(source)}
                className="rounded p-1 text-foreground-muted hover:text-foreground hover:bg-background-1"
                title="Edit source settings"
              >
                <Settings className="h-4 w-4" />
              </button>
              <Switch
                checked={source.enabled}
                onCheckedChange={(v) => handleToggle(source.id, v)}
              />
              {!source.builtin && (
                <button
                  type="button"
                  onClick={() => handleRemoveSource(source.id)}
                  className="rounded p-1 text-foreground-muted hover:text-destructive hover:bg-background-1"
                  title="Remove source"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-6 relative">
      {mcpSources.length > 0 && renderSourceList(mcpSources, 'MCP Sources')}
      {mcpSources.length > 0 && skillSources.length > 0 && <Separator />}
      {skillSources.length > 0 && renderSourceList(skillSources, 'Skills')}

      {!showAddForm ? (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-3 text-sm text-foreground-muted hover:text-foreground hover:border-border transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add marketplace source
        </button>
      ) : (
        <div className="rounded-lg border border-border/60 p-4 space-y-3">
          <h4 className="text-sm font-medium">Add Source</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-foreground-muted">Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Marketplace"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-foreground-muted">Kind</label>
              <select
                value={formData.kind}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    kind: e.target.value as 'mcp' | 'skill',
                    type: inferKindFromType(formData.type) === e.target.value ? formData.type : '',
                  })
                }
                className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 py-1 text-sm shadow-sm focus:border-primary focus:outline-none"
              >
                <option value="mcp">MCP</option>
                <option value="skill">Skills</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-foreground-muted">URL</label>
            <Input
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://example.com/api/catalog"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-foreground-muted">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 py-1 text-sm shadow-sm focus:border-primary focus:outline-none"
            >
              <option value="">Auto-detect</option>
              <option value="smithery">Smithery</option>
              <option value="github-mcp-registry">GitHub MCP Registry</option>
              <option value="github-repo">GitHub Repo (Skills)</option>
              <option value="openai-skills">OpenAI Skills</option>
              <option value="anthropic-skills">Anthropic Skills</option>
              <option value="json-feed">JSON Feed</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setFormData({ name: '', url: '', kind: 'mcp', type: '' });
              }}
              className="rounded-md px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddSource}
              disabled={!formData.name || !formData.url}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Add Source
            </button>
          </div>
        </div>
      )}

      {/* Edit Source Modal Overlay */}
      {editingSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl border border-border/60 bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-medium">{editingSource.name}</h3>
              <button
                type="button"
                onClick={() => setEditingSource(null)}
                className="rounded p-1 text-foreground-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-foreground-muted">Authentication</label>
                <select
                  value={editingSource.authType}
                  onChange={(e) =>
                    setEditingSource({
                      ...editingSource,
                      authType: e.target.value as EditSourceState['authType'],
                      token: e.target.value === 'none' ? '' : editingSource.token,
                    })
                  }
                  className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 py-1 text-sm shadow-sm focus:border-primary focus:outline-none"
                >
                  <option value="none">None</option>
                  <option value="github-token">GitHub Personal Access Token</option>
                  <option value="bearer">Bearer Token</option>
                </select>
              </div>
              {editingSource.authType !== 'none' && (
                <div className="space-y-1">
                  <label className="text-xs text-foreground-muted">
                    {editingSource.authType === 'github-token'
                      ? 'GitHub PAT (github_token or ghp_...)'
                      : 'Bearer Token'}
                  </label>
                  <Input
                    value={editingSource.token}
                    onChange={(e) => setEditingSource({ ...editingSource, token: e.target.value })}
                    placeholder={
                      editingSource.authType === 'github-token'
                        ? 'ghp_xxxxxxxxxxxx'
                        : 'your-token-here'
                    }
                    type="password"
                  />
                  {editingSource.authType === 'github-token' && (
                    <p className="text-[11px] text-foreground-muted/70">
                      Used to bypass GitHub API rate limit (60/hr → 5000/hr).
                      <br />
                      Create at{' '}
                      <span className="text-foreground underline">github.com/settings/tokens</span>
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingSource(null)}
                className="rounded-md px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
