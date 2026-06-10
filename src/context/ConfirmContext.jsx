import { createContext, useCallback, useContext, useRef, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal/ConfirmModal.jsx';

const ConfirmContext = createContext(() => Promise.resolve(false));

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({ open: false, item: null, action: 'delete' });
  const resolverRef = useRef(null);

  const confirm = useCallback((item, action = 'delete') => {
    return new Promise((resolve) => {
      // Si había un modal pendiente, resuélvelo como cancelado.
      if (resolverRef.current) resolverRef.current(false);
      resolverRef.current = resolve;
      setState({ open: true, item, action });
    });
  }, []);

  const close = useCallback((result) => {
    setState((s) => ({ ...s, open: false }));
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal state={state} onClose={close} />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
