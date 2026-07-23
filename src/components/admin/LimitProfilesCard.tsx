import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sliders, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// limit_profiles isn't in the generated Supabase types yet — same `as any`
// pattern already used elsewhere for tables added outside a full type regen.
interface LimitProfile {
  id: string;
  name: string;
  max_file_size_mb: number | null;
  media_retention_days: number | null;
  auto_delete_on_view: boolean;
}

interface ProfileFormState {
  sizeEnabled: boolean;
  sizeInput: string;
  retentionEnabled: boolean;
  retentionInput: string;
  autoDeleteOnView: boolean;
}

function toFormState(p: LimitProfile): ProfileFormState {
  return {
    sizeEnabled: p.max_file_size_mb != null,
    sizeInput: String(p.max_file_size_mb ?? 50),
    retentionEnabled: p.media_retention_days != null,
    retentionInput: String(p.media_retention_days ?? 90),
    autoDeleteOnView: p.auto_delete_on_view,
  };
}

function isDirty(form: ProfileFormState, baseline: ProfileFormState): boolean {
  return (
    form.sizeEnabled !== baseline.sizeEnabled ||
    form.sizeInput !== baseline.sizeInput ||
    form.retentionEnabled !== baseline.retentionEnabled ||
    form.retentionInput !== baseline.retentionInput ||
    form.autoDeleteOnView !== baseline.autoDeleteOnView
  );
}

function summarize(form: ProfileFormState): string {
  const parts = [
    form.sizeEnabled ? `${form.sizeInput || "?"}MB` : "Sem limite de tamanho",
    form.retentionEnabled ? `${form.retentionInput || "?"} dias` : "Sem prazo",
  ];
  if (form.autoDeleteOnView) parts.push("Visualização única");
  return parts.join(" · ");
}

export default function LimitProfilesCard() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<LimitProfile[]>([]);
  const [forms, setForms] = useState<Record<string, ProfileFormState>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("limit_profiles" as any)
      .select("id, name, max_file_size_mb, media_retention_days, auto_delete_on_view")
      .order("created_at", { ascending: true });

    if (!error && data) {
      const list = data as unknown as LimitProfile[];
      setProfiles(list);
      const nextForms: Record<string, ProfileFormState> = {};
      list.forEach((p) => (nextForms[p.id] = toFormState(p)));
      setForms(nextForms);
    }
    setLoading(false);
  };

  const updateForm = (id: string, patch: Partial<ProfileFormState>) => {
    setForms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDiscard = (profile: LimitProfile) => {
    updateForm(profile.id, toFormState(profile));
  };

  const handleSave = async (profile: LimitProfile) => {
    const form = forms[profile.id];
    const sizeMb = form.sizeEnabled ? parseInt(form.sizeInput, 10) : null;
    const retentionDays = form.retentionEnabled ? parseInt(form.retentionInput, 10) : null;

    if (form.sizeEnabled && (!sizeMb || sizeMb <= 0)) {
      toast({ title: "Valor inválido", description: "Informe um tamanho máximo maior que zero.", variant: "destructive" });
      return;
    }
    if (form.retentionEnabled && (!retentionDays || retentionDays <= 0)) {
      toast({ title: "Valor inválido", description: "Informe um prazo em dias maior que zero.", variant: "destructive" });
      return;
    }

    setSavingId(profile.id);
    const { error } = await supabase
      .from("limit_profiles" as any)
      .update({
        max_file_size_mb: sizeMb,
        media_retention_days: retentionDays,
        auto_delete_on_view: form.autoDeleteOnView,
      })
      .eq("id", profile.id);
    setSavingId(null);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Perfil "${profile.name}" atualizado` });
      fetchProfiles();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sliders className="h-4 w-4" /> Perfis de limite
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profiles.map((profile) => {
          const form = forms[profile.id];
          if (!form) return null;
          const expanded = expandedIds.has(profile.id);
          const dirty = isDirty(form, toFormState(profile));

          return (
            <div key={profile.id} className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => toggleExpanded(profile.id)}
                className="flex w-full items-center justify-between gap-2 p-3 text-left"
              >
                <div className="min-w-0">
                  <p className="font-medium">{profile.name}</p>
                  {!expanded && (
                    <p className="text-xs text-muted-foreground truncate">{summarize(form)}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {dirty && (
                    <span className="h-2 w-2 rounded-full bg-primary" title="Alterações não salvas" />
                  )}
                  {expanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {expanded && (
                <div className="space-y-4 border-t border-border p-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`size-toggle-${profile.id}`} className="text-sm">
                        Limitar tamanho de arquivo
                      </Label>
                      <Switch
                        id={`size-toggle-${profile.id}`}
                        checked={form.sizeEnabled}
                        onCheckedChange={(checked) => updateForm(profile.id, { sizeEnabled: checked })}
                      />
                    </div>
                    {form.sizeEnabled ? (
                      <Input
                        type="number"
                        min={1}
                        value={form.sizeInput}
                        onChange={(e) => updateForm(profile.id, { sizeInput: e.target.value })}
                        placeholder="Tamanho máximo (MB)"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">Sem limite de tamanho.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`view-toggle-${profile.id}`} className="text-sm">
                        Excluir mídia assim que for visualizada
                      </Label>
                      <Switch
                        id={`view-toggle-${profile.id}`}
                        checked={form.autoDeleteOnView}
                        onCheckedChange={(checked) => updateForm(profile.id, { autoDeleteOnView: checked })}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {form.autoDeleteOnView
                        ? "Toda mídia enviada some para sempre logo depois que o destinatário abrir e sair da visualização — como visualização única automática, sem o remetente precisar escolher."
                        : "Desativado: mídias continuam disponíveis normalmente após visualizadas."}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`retention-toggle-${profile.id}`} className="text-sm">
                        Excluir mídias automaticamente por prazo
                      </Label>
                      <Switch
                        id={`retention-toggle-${profile.id}`}
                        checked={form.retentionEnabled}
                        onCheckedChange={(checked) => updateForm(profile.id, { retentionEnabled: checked })}
                      />
                    </div>
                    {form.retentionEnabled ? (
                      <Input
                        type="number"
                        min={1}
                        value={form.retentionInput}
                        onChange={(e) => updateForm(profile.id, { retentionInput: e.target.value })}
                        placeholder="Dias até expirar"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Sem prazo por dias{form.autoDeleteOnView ? " (mídias já somem ao serem vistas, acima)" : ": mídias nunca expiram"}.
                      </p>
                    )}
                  </div>

                  {dirty && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDiscard(profile)}
                        disabled={savingId === profile.id}
                        className="flex-1"
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSave(profile)}
                        disabled={savingId === profile.id}
                        className="flex-1"
                      >
                        {savingId === profile.id ? "Salvando..." : "Salvar"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
