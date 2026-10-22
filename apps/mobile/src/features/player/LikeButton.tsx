// Copyright (c) 2023 BytePlus Pte. Ltd.
// SPDX-License-Identifier: Apache-2.0
// Modified by Reel Drama: server-backed state, haptics, accessibility, typed props.

import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import LottieView from 'lottie-react-native';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { overlayText } from '@/ui/theme';

const likeLottie = require('@/assets/byteplus/lottie/like.json');
const unlikeLottie = require('@/assets/byteplus/lottie/unLike.json');
const likedIcon = require('@/assets/byteplus/icons/like.png');
const unlikedIcon = require('@/assets/byteplus/icons/unlike.png');

export function LikeButton({ liked, count, onToggle, label }: { liked: boolean; count: string; onToggle: (next: boolean) => void; label: string }) {
  const [isLiked, setIsLiked] = useState(liked);
  const [prevLiked, setPrevLiked] = useState(liked);
  // Server state changed (e.g. refetch): adopt it. Derived during render, not in an effect.
  if (prevLiked !== liked) {
    setPrevLiked(liked);
    setIsLiked(liked);
  }
  const [animating, setAnimating] = useState<'like' | 'unlike' | null>(null);
  const likeRef = useRef<LottieView>(null);
  const unlikeRef = useRef<LottieView>(null);

  const press = useCallback(() => {
    const next = !isLiked;
    setIsLiked(next);
    setAnimating(next ? 'like' : 'unlike');
    requestAnimationFrame(() => (next ? likeRef.current : unlikeRef.current)?.play());
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(next);
  }, [isLiked, onToggle]);

  return (
    <Pressable onPress={press} style={styles.button} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: isLiked }} testID="like-button">
      <View style={styles.iconBox}>
        <View style={[styles.anim, { opacity: animating === 'like' ? 1 : 0 }]} pointerEvents="none">
          <LottieView ref={likeRef} source={likeLottie} style={styles.lottie} autoPlay={false} loop={false} onAnimationFinish={() => setAnimating(null)} />
        </View>
        <View style={[styles.anim, { opacity: animating === 'unlike' ? 1 : 0 }]} pointerEvents="none">
          <LottieView ref={unlikeRef} source={unlikeLottie} style={styles.lottie} autoPlay={false} loop={false} onAnimationFinish={() => setAnimating(null)} />
        </View>
        <Image source={isLiked ? likedIcon : unlikedIcon} style={[styles.icon, { opacity: animating ? 0 : 1 }]} />
      </View>
      <Text style={styles.count}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', gap: 2 },
  iconBox: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  anim: { position: 'absolute', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  lottie: { width: 50, height: 50 },
  icon: { width: 40, height: 40 },
  count: { color: '#fff', fontSize: 13, ...overlayText },
});
