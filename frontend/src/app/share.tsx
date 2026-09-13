import { useEffect, useMemo, useState } from "react";
import { Alert, Image, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { router } from "expo-router";
import { useIncomingShare } from "expo-sharing";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { Spinner } from "@/components/ui/Spinner";
import { recognizeReceipt } from "@/features/capture/ocr";

export default function ShareScreen() {
  const { resolvedSharedPayloads, isResolving, error, clearSharedPayloads } = useIncomingShare();
  const [scanning, setScanning] = useState(false);
  const image = useMemo(() => resolvedSharedPayloads.find((payload) => payload.contentType === "image" && payload.contentUri), [resolvedSharedPayloads]);

  useEffect(() => {
    if (error) {
      Alert.alert("Could not import photo", error.message);
    }
  }, [error]);

  const continueToExpense = async () => {
    if (!image?.contentUri) {
      return;
    }
    setScanning(true);
    await recognizeReceipt(image.contentUri);
    setScanning(false);
    clearSharedPayloads();
    router.replace({ pathname: "/expense/new", params: { receiptUri: image.contentUri } });
  };

  return (
    <Screen>
      <PageHeader title="Import receipt" subtitle="Shared from WhatsApp or another app" />
      {isResolving ? <Spinner size="large" centered /> : null}
      {!isResolving && image?.contentUri ? (
        <View className="gap-6">
          <Image source={{ uri: image.contentUri }} className="h-80 w-full rounded-card bg-gray-100" resizeMode="contain" />
          <View className="rounded-card bg-mint-soft p-5">
            <Text className="font-bold text-ink">Only this image was received</Text>
            <Text className="mt-2 text-sm leading-5 text-slate">LenaDena does not receive the WhatsApp chat, contact list, or conversation name. Nothing is uploaded until you save the reviewed expense.</Text>
          </View>
          <Button label="Continue to division" icon="arrow-right" iconSide="right" size="lg" fullWidth loading={scanning} onPress={continueToExpense} />
          <Button label="Discard" icon="trash-2" variant="ghost" fullWidth onPress={() => { clearSharedPayloads(); router.replace("/"); }} />
        </View>
      ) : null}
      {!isResolving && !image ? (
        <View className="rounded-card border border-line bg-raised p-6">
          <Text className="text-lg font-bold text-ink">No shared image found</Text>
          <Text className="mt-2 text-sm leading-5 text-slate">Open a receipt in WhatsApp, tap Share, and choose LenaDena. You can also choose a receipt from Add expense.</Text>
          <View className="mt-5"><Button label="Add expense" icon="plus" onPress={() => router.replace("/expense/new")} /></View>
        </View>
      ) : null}
    </Screen>
  );
}
