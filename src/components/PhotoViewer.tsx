import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  Dimensions,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ViewerImage = {
  id: string;
  url: string;
};

export type PhotoViewerProps = {
  visible: boolean;
  images: ViewerImage[];
  initialIndex?: number;
  onClose: () => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export function PhotoViewer({
  visible,
  images,
  initialIndex = 0,
  onClose,
}: PhotoViewerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // Whenever the modal opens, scroll to the requested initial index
  useEffect(() => {
    if (!visible) return;
    setActiveIndex(initialIndex);
    // Defer so the ScrollView has mounted with its content
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({
        x: initialIndex * SCREEN_W,
        animated: false,
      });
    }, 0);
    return () => clearTimeout(t);
  }, [visible, initialIndex]);

  if (images.length === 0) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.root}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            setActiveIndex(idx);
          }}
        >
          {images.map((img) => (
            <Pressable
              key={img.id}
              onPress={onClose}
              style={{ width: SCREEN_W, height: SCREEN_H }}
            >
              <Image
                source={{ uri: img.url }}
                style={styles.image}
                resizeMode="contain"
              />
            </Pressable>
          ))}
        </ScrollView>

        {/* Top bar — counter + close */}
        <View style={styles.topBar} pointerEvents="box-none">
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {activeIndex + 1} / {images.length}
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Page dots */}
        {images.length > 1 && (
          <View style={styles.dots} pointerEvents="none">
            {images.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === activeIndex ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  image: { width: SCREEN_W, height: SCREEN_H },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  counter: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  counterText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
  },
  dotActive: { width: 24, backgroundColor: '#fff' },
  dotInactive: { width: 6, backgroundColor: 'rgba(255,255,255,0.5)' },
});
