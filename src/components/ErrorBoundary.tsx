import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import * as Sentry from '@sentry/react-native';

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
  componentStack: string | null;
};

/**
 * Catches render-time errors anywhere in the tree and shows the full
 * component stack so we can pinpoint which component is throwing.
 * Especially useful for "Couldn't find a navigation context" — the
 * default RN red-screen elides the React stack.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Mirror to console with full stack so it shows up in Metro
    // even if the on-device LogBox swallows it.
    console.error('[ErrorBoundary] caught:', error);
    console.error('[ErrorBoundary] componentStack:', info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
    // Forward to Sentry so production crashes are tracked.
    try {
      Sentry.captureException(error, {
        contexts: {
          react: { componentStack: info.componentStack ?? 'unavailable' },
        },
      });
    } catch {
      /* sentry isn't configured (no DSN) — ignore */
    }
  }

  reset = () => {
    this.setState({ error: null, componentStack: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>App error</Text>
          <Text style={styles.msg}>{this.state.error.message}</Text>

          <Text style={styles.label}>Stack</Text>
          <Text style={styles.code} selectable>
            {this.state.error.stack}
          </Text>

          <Text style={styles.label}>Component stack</Text>
          <Text style={styles.code} selectable>
            {this.state.componentStack}
          </Text>

          <Pressable onPress={this.reset} style={styles.btn}>
            <Text style={styles.btnText}>Try to recover</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff', paddingTop: 56 },
  scroll: { padding: 20, paddingBottom: 80 },
  title: { fontSize: 22, fontWeight: '800', color: '#DC2626' },
  msg: { marginTop: 8, fontSize: 14, color: '#18181B' },
  label: {
    marginTop: 20,
    fontSize: 11,
    fontWeight: '700',
    color: '#71717A',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  code: {
    marginTop: 4,
    fontFamily: 'Courier',
    fontSize: 11,
    color: '#27272A',
    backgroundColor: '#F4F4F5',
    padding: 8,
    borderRadius: 8,
  },
  btn: {
    marginTop: 24,
    backgroundColor: '#F97316',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
