import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SaleStackParamList } from '../../types';
import { captureBus } from '../../lib/captureBus';
import { Button } from '../../components/ui';

type Route = RouteProp<SaleStackParamList, 'Capture'>;

export default function CaptureSaleScreen() {
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const maxPhotos = route.params?.max ?? 10;

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [shots, setShots] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);

  const remaining = maxPhotos - shots.length;

  const takeShot = async () => {
    if (capturing || remaining <= 0) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.85,
        skipProcessing: true,
      });
      if (photo?.uri) {
        setShots((prev) => [...prev, photo.uri]);
      }
    } catch (e: any) {
      Alert.alert('Camera error', e.message ?? 'Could not take photo.');
    } finally {
      setCapturing(false);
    }
  };

  const removeShot = (i: number) => {
    setShots((prev) => prev.filter((_, idx) => idx !== i));
  };

  const flip = () => {
    setFacing((p) => (p === 'back' ? 'front' : 'back'));
  };

  const done = () => {
    captureBus.emit(shots);
    navigation.goBack();
  };

  const cancel = () => {
    captureBus.emit([]);
    navigation.goBack();
  };

  // Permission states
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1F4D3A" />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.permWrap}>
        <View style={styles.permIcon}>
          <Ionicons name="camera-outline" size={32} color="#1F4D3A" />
        </View>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          Allow camera access to snap photos for your sale.
        </Text>
        <View style={{ width: '100%', maxWidth: 280, marginTop: 16 }}>
          <Button size="lg" onPress={requestPermission}>
            Grant access
          </Button>
        </View>
        <Pressable onPress={cancel} style={{ marginTop: 12 }}>
          <Text style={styles.permCancel}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
      />

      {/* Top bar */}
      <View
        style={[styles.topBar, { top: Math.max(insets.top, 12) }]}
        pointerEvents="box-none"
      >
        <Pressable onPress={cancel} style={styles.topBtn}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={styles.counter}>
          <Ionicons name="camera" size={14} color="#fff" />
          <Text style={styles.counterText}>
            {shots.length} / {maxPhotos}
          </Text>
        </View>
        <Pressable onPress={flip} style={styles.topBtn}>
          <Ionicons name="camera-reverse" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Bottom strip */}
      <View
        style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) }]}
        pointerEvents="box-none"
      >
        {/* Thumbnail strip */}
        {shots.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              gap: 8,
              paddingBottom: 12,
            }}
          >
            {shots.map((uri, i) => (
              <View key={uri} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumb} />
                <Pressable
                  onPress={() => removeShot(i)}
                  style={styles.thumbX}
                >
                  <Ionicons name="close" size={12} color="#fff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Capture row */}
        <View style={styles.captureRow}>
          {/* Spacer to balance the row */}
          <View style={{ width: 64 }} />

          {/* Shutter button */}
          <Pressable
            onPress={takeShot}
            disabled={capturing || remaining <= 0}
            style={[
              styles.shutter,
              (capturing || remaining <= 0) && { opacity: 0.5 },
            ]}
          >
            <View style={styles.shutterInner} />
          </Pressable>

          {/* Done button */}
          <Pressable
            onPress={done}
            disabled={shots.length === 0}
            style={[
              styles.doneBtn,
              shots.length === 0 && { opacity: 0.4 },
            ]}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permWrap: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  permIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFE8D6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  permTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#18181B',
    marginBottom: 6,
  },
  permBody: {
    fontSize: 14,
    color: '#71717A',
    textAlign: 'center',
    lineHeight: 20,
  },
  permCancel: { color: '#71717A', fontSize: 14, fontWeight: '500' },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  counterText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },

  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  thumbWrap: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  thumb: { width: '100%', height: '100%' },
  thumbX: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  doneBtn: {
    width: 64,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F4D3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
