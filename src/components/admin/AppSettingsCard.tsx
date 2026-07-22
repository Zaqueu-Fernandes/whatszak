import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// app_settings isn't in the generated Supabase types yet — same `as any`
// pattern already used elsewhere for tables added outside a full type regen.
interface AppSettings {
  max_file_size_mb: number;
  media_retention_days: number | null;
}

export default function AppSettingsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maxSizeInput, setMaxSizeInput] = useState("50");
  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionInput, setRetentionInput] = useState("90");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_settings" as any)
      .select("max_file_size_mb, media_retention_days")
      .eq("id", 1)
      .single();

    if (!error && data) {
      const s = data as unknown as AppSettings;
      setSettings(s);
      setMaxSizeInput(String(s.max_file_size_mb));
      setRetentionEnabled(s.media_retention_days != null);
      setRetentionInput(String(s.media_retention_days ?? 90));
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    const maxSizeMb = parseInt(maxSizeInput, 10);
    const retentionDays = retentionEnabled ? parseInt(retentionInput, 10) : null;

    if (!maxSizeMb || maxSizeMb <= 0) {
      toast({ title: "Valor inválido", description: "Informe um tamanho máximo maior que zero.", variant: "destructive" });
      return;
    }
    if (retentionEnabled && (!retentionDays || retentionDays <= 0)) {
      toast({ title: "Valor inválido", description: "Informe um prazo em dias maior que zero.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("app_settings" as any)
      .update({
        max_file_size_mb: maxSizeMb,
        media_retention_days: retentionDays,
        updated_by: user.id,
      })
      .eq("id", 1);
    setSaving(false);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configurações salvas" });
      fetchSettings();
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
          <Settings className="h-4 w-4" /> Mídias e arquivos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="max-size">Tamanho máximo de arquivo (MB)</Label>
          <Input
            id="max-size"
            type="number"
            min={1}
            value={maxSizeInput}
            onChange={(e) => setMaxSizeInput(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Vale para fotos, vídeos, áudios e arquivos enviados no chat.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="retention-toggle">Excluir mídias automaticamente</Label>
            <Switch id="retention-toggle" checked={retentionEnabled} onCheckedChange={setRetentionEnabled} />
          </div>
          {retentionEnabled ? (
            <>
              <Input
                type="number"
                min={1}
                value={retentionInput}
                onChange={(e) => setRetentionInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Dias após o envio até o arquivo ser apagado permanentemente. A mensagem continua na conversa,
                mostrando "Mídia expirada".
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Desativado: mídias ficam disponíveis indefinidamente.
            </p>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Salvando..." : "Salvar configurações"}
        </Button>
      </CardContent>
    </Card>
  );
}
