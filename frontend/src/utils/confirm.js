import { ref } from "vue";

const confirmRef = ref(null);

export function setConfirmRef(ref) {
  confirmRef.value = ref;
}

export function useConfirm(options) {
  if (!confirmRef.value) {
    console.warn("ConfirmDialog not mounted, falling back to native confirm");
    return Promise.resolve(
      window.confirm(options?.message || options?.title || "确认操作？"),
    );
  }
  return confirmRef.value.open(options || {});
}
