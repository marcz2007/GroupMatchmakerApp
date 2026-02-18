import React, { useEffect, useMemo } from "react";
import { StyleSheet, Dimensions, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  interpolate,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const NUM_STARS = 60;
const NUM_SHOOTING_STARS = 3;
const NUM_NEBULA_BLOBS = 4;

// Deterministic random from seed
const seededRandom = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
};

interface StarProps {
  index: number;
}

const Star = React.memo(({ index }: StarProps) => {
  const opacity = useSharedValue(seededRandom(index * 3 + 1) * 0.4 + 0.1);
  const size = useMemo(() => seededRandom(index * 7 + 2) * 2.5 + 0.5, [index]);
  const x = useMemo(() => seededRandom(index * 13 + 3) * SCREEN_WIDTH, [index]);
  const y = useMemo(() => seededRandom(index * 17 + 5) * SCREEN_HEIGHT, [index]);
  const delay = useMemo(() => seededRandom(index * 23 + 7) * 4000, [index]);
  const duration = useMemo(() => 2000 + seededRandom(index * 29 + 11) * 3000, [index]);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.8 + seededRandom(index) * 0.2, {
            duration,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(seededRandom(index * 3 + 1) * 0.3 + 0.05, {
            duration: duration * 0.8,
            easing: Easing.inOut(Easing.sin),
          })
        ),
        -1,
        true
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const isLarge = size > 2;

  return (
    <Animated.View
      style={[
        styles.star,
        style,
        {
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#fff",
          shadowColor: isLarge ? "#aaccff" : "transparent",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: isLarge ? 0.8 : 0,
          shadowRadius: isLarge ? 4 : 0,
        },
      ]}
    />
  );
});

interface ShootingStarProps {
  index: number;
}

const ShootingStar = React.memo(({ index }: ShootingStarProps) => {
  const progress = useSharedValue(0);
  const startX = useMemo(() => seededRandom(index * 41 + 100) * SCREEN_WIDTH * 0.8, [index]);
  const startY = useMemo(() => seededRandom(index * 43 + 200) * SCREEN_HEIGHT * 0.3, [index]);
  const initialDelay = useMemo(() => 3000 + seededRandom(index * 47 + 300) * 8000, [index]);
  const loopDelay = useMemo(() => 6000 + seededRandom(index * 53 + 400) * 10000, [index]);

  useEffect(() => {
    progress.value = withDelay(
      initialDelay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 0 }),
          withDelay(loopDelay, withTiming(0, { duration: 0 }))
        ),
        -1
      )
    );
  }, []);

  const style = useAnimatedStyle(() => {
    const translateX = interpolate(progress.value, [0, 1], [0, 180]);
    const translateY = interpolate(progress.value, [0, 1], [0, 120]);
    const opacity = interpolate(progress.value, [0, 0.1, 0.5, 1], [0, 1, 0.6, 0]);
    const scaleX = interpolate(progress.value, [0, 0.3, 1], [0, 1, 0.3]);

    return {
      transform: [{ translateX }, { translateY }, { rotate: "33deg" }, { scaleX }],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        styles.shootingStar,
        style,
        { left: startX, top: startY },
      ]}
    >
      <View style={styles.shootingStarHead} />
      <View style={styles.shootingStarTail} />
    </Animated.View>
  );
});

interface NebulaBlobProps {
  index: number;
}

const NebulaBlob = React.memo(({ index }: NebulaBlobProps) => {
  const opacity = useSharedValue(0.02);
  const x = useMemo(() => seededRandom(index * 59 + 500) * SCREEN_WIDTH, [index]);
  const y = useMemo(() => seededRandom(index * 61 + 600) * SCREEN_HEIGHT, [index]);
  const size = useMemo(() => 150 + seededRandom(index * 67 + 700) * 200, [index]);
  const colors = useMemo(() => {
    const palette = [
      "rgba(87, 98, 183, 0.06)",  // purple-ish (matches primary)
      "rgba(60, 80, 180, 0.04)",  // blue
      "rgba(120, 60, 180, 0.05)", // violet
      "rgba(40, 100, 160, 0.04)", // teal-blue
    ];
    return palette[index % palette.length];
  }, [index]);

  useEffect(() => {
    opacity.value = withDelay(
      seededRandom(index * 71) * 3000,
      withRepeat(
        withSequence(
          withTiming(0.08, { duration: 5000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.02, { duration: 6000, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.nebulaBlob,
        style,
        {
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors,
        },
      ]}
    />
  );
});

const Starfield = () => {
  const stars = useMemo(
    () => Array.from({ length: NUM_STARS }, (_, i) => i),
    []
  );
  const shootingStars = useMemo(
    () => Array.from({ length: NUM_SHOOTING_STARS }, (_, i) => i),
    []
  );
  const nebulaBlobs = useMemo(
    () => Array.from({ length: NUM_NEBULA_BLOBS }, (_, i) => i),
    []
  );

  return (
    <View style={styles.container} pointerEvents="none">
      {nebulaBlobs.map((i) => (
        <NebulaBlob key={`nebula-${i}`} index={i} />
      ))}
      {stars.map((i) => (
        <Star key={`star-${i}`} index={i} />
      ))}
      {shootingStars.map((i) => (
        <ShootingStar key={`shooting-${i}`} index={i} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  star: {
    position: "absolute",
  },
  shootingStar: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
  },
  shootingStarHead: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#fff",
    shadowColor: "#aaddff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  shootingStarTail: {
    width: 40,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: "rgba(170, 200, 255, 0.4)",
    marginLeft: -1,
  },
  nebulaBlob: {
    position: "absolute",
  },
});

export default Starfield;
