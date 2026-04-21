import { Redirect } from 'expo-router';
import React from 'react';

export default function CreateOnboardingScreen() {
  return <Redirect href={{ pathname: '/onboarding', params: { mode: 'create' } }} />;
}
