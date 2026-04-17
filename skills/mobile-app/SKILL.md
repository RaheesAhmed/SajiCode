---
name: mobile-app
description: "Build cross-platform mobile applications with React Native and Expo. Covers Expo Router navigation, NativeWind styling, offline-first architecture with AsyncStorage, push notifications, platform-specific code, and performance optimization for FlatList and animations. Use when building mobile apps, adding mobile features, or creating cross-platform experiences."
---

# Mobile App Development

## Stack Selection

| Approach | Best For | Trade-offs |
|----------|----------|-----------|
| Expo (managed) | Most apps, fast iteration | Limited native module access |
| Expo (dev build) | Full native access + Expo DX | Requires native build |
| React Native CLI | Maximum control, custom native | More setup, slower iteration |

## Development Workflow

### Step 1: Initialize Project

```bash
npx -y create-expo-app@latest my-app --template tabs
cd my-app && npx expo start
```

**Checkpoint:** App launches in simulator/device before adding features.

### Step 2: Set Up Navigation (Expo Router)

```
app/
├── _layout.tsx           # Root layout
├── (tabs)/
│   ├── _layout.tsx       # Tab bar layout
│   ├── index.tsx         # Home tab
│   └── profile.tsx       # Profile tab
├── (auth)/
│   ├── _layout.tsx       # Auth flow layout
│   ├── login.tsx
│   └── register.tsx
├── [id].tsx              # Dynamic route
└── modal.tsx             # Modal screen
```

```tsx
import { Tabs } from "expo-router";
import { Home, User } from "lucide-react-native";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: "#8b5cf6",
      tabBarStyle: { backgroundColor: "#0a0a0a", borderTopColor: "#1a1a1a" },
      headerStyle: { backgroundColor: "#0a0a0a" },
      headerTintColor: "#fff",
    }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <Home size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <User size={22} color={color} /> }} />
    </Tabs>
  );
}
```

### Step 3: Implement Data Layer

Use TanStack Query for server state with offline support:

```tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => fetch("/api/users").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
}

function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserInput) =>
      fetch("/api/users", { method: "POST", body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
```

### Step 4: Add Offline Support

```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

async function fetchWithOffline<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  const isConnected = (await NetInfo.fetch()).isConnected;
  if (isConnected) {
    try {
      const data = await fetchFn();
      await AsyncStorage.setItem(key, JSON.stringify(data));
      return data;
    } catch { /* fall through to cache */ }
  }
  const cached = await AsyncStorage.getItem(key);
  if (cached) return JSON.parse(cached);
  throw new Error("No data available offline");
}
```

**Checkpoint:** Test offline behavior by enabling airplane mode — cached data should render.

### Step 5: Configure Push Notifications

```tsx
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return null;
  const token = await Notifications.getExpoPushTokenAsync({ projectId: "your-project-id" });
  return token.data;
}
```

## Platform-Specific Code

```tsx
import { Platform, StyleSheet } from "react-native";

const styles = StyleSheet.create({
  shadow: Platform.select({
    ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
    android: { elevation: 4 },
    default: {},
  }),
});
```

## Performance Rules

- Use `FlatList` for long lists — never `ScrollView` with `.map()`
- Memoize expensive computations with `useMemo` and `useCallback`
- Use `React.memo` for list items
- Optimize images: resize, compress, use `expo-image` for caching
- Create `StyleSheet` once outside the component — avoid inline styles
- Use `react-native-reanimated` for smooth 60fps animations
