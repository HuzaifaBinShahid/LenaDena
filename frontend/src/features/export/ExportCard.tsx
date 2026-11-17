import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api";
import { exportMyData } from "./exportFile";
import { EXPORT_CHOICES, type ExportFormat } from "./exportRules";

/**
 * The card Settings -> Export my data opens: choose a spreadsheet or the complete file. The file is made by the server
 * from the person's own records and handed to the phone's share sheet; photos are not in it.
 */
export function ExportCard({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const run = async (format: ExportFormat) => {
    setBusy(format);
    try {
      const result = await exportMyData(format);
      if (result === "unavailable") toast.info("Sharing isn't available here", "This device can't open the share sheet, so the file couldn't be handed over.");
      else toast.success(result === "downloaded" ? "Export downloaded" : "Your records are ready", "Save it somewhere safe: it holds your balances and who you share them with.");
      if (result !== "unavailable") onClose();
    } catch (error) {
      toast.error("Couldn't export your records", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-4 rounded-[24px] border border-line bg-raised p-4">
      <View>
        <Text className="text-lg font-bold text-ink">Export my data</Text>
        <Text className="mt-1 text-sm leading-5 text-slate">Your own records, made from what LenaDena keeps about you. Other people appear by name only. Photos and receipt images aren't included.</Text>
      </View>
      {EXPORT_CHOICES.map((choice) => (
        <View key={choice.format} className="gap-2">
          <Button
            label={choice.title}
            icon={choice.icon}
            variant={choice.format === "csv" ? "primary" : "secondary"}
            size="lg"
            fullWidth
            loading={busy === choice.format}
            disabled={busy !== null && busy !== choice.format}
            onPress={() => void run(choice.format)}
          />
          <Text className="px-1 text-xs leading-4 text-slate">{choice.detail}</Text>
        </View>
      ))}
      <Button label="Cancel" variant="ghost" fullWidth disabled={busy !== null} onPress={onClose} />
    </View>
  );
}
