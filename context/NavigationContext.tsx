"use client";

import React, { createContext, useContext, useState } from 'react';

type NavContextType = {
  loading: boolean;
  setLoading: (v: boolean) => void;
};

const NavigationContext = createContext<NavContextType | null>(null);

export const NavigationProvider = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(false);
  return (
    <NavigationContext.Provider value={{ loading, setLoading }}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
};

export default NavigationContext;
