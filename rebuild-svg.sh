#!/bin/bash

# Stop any running processes
echo "Stopping any running processes..."
pkill -f "expo"
pkill -f "react-native"

# Install dependencies 
echo "Installing SVG dependencies..."
yarn add react-native-svg

# Add SVG plugin to app.json
echo "Configured SVG plugin in app.json"

# Clean project
echo "Cleaning project..."
rm -rf node_modules/.cache
rm -rf ios/build
rm -rf android/app/build

# Reinstall dependencies
echo "Reinstalling dependencies..."
yarn install

# Rebuild the development client
echo "Rebuilding development client..."
npx expo prebuild --clean

# Run the app
echo "Starting the app with dev client..."
npx expo run:ios --device  # or npx expo run:android for Android

echo "Done!" 