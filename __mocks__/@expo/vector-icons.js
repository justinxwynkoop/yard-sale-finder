// Auto-applied manual mock for @expo/vector-icons. The real package pulls in
// expo-asset/expo-font, which don't resolve under jest-expo. Render each icon's
// `name` as <Text> so tests can assert which icon shows (e.g. 'heart','NEW').
const React = require('react');
const { Text } = require('react-native');
const makeIconSet = () => {
  const Icon = (props) =>
    React.createElement(Text, { ...props }, props && props.name ? String(props.name) : null);
  Icon.displayName = 'MockIcon';
  return Icon;
};
module.exports = new Proxy(
  {},
  { get: (_target, prop) => (prop === '__esModule' ? false : makeIconSet()) },
);
