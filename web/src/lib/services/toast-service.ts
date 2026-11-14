import { toastStore } from '../store/toast-store';

const toastStoreInstance = toastStore;

export const toastService = {
  success(message: string) {
    toastStoreInstance.success(message);
  },

  error(message: string) {
    toastStoreInstance.error(message);
  },

  info(message: string) {
    toastStoreInstance.info(message);
  }
};
