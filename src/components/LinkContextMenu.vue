<template>
  <!-- Context Menu Backdrop -->
  <div
    v-if="show"
    class="context-menu-backdrop"
    @click="$emit('close')"
  ></div>

  <!-- Context Menu -->
  <div
    v-if="show"
    class="context-menu"
    :style="{ left: x + 'px', top: y + 'px' }"
    @click.stop
  >
    <button
      @click="$emit('edit')"
      class="context-menu-item"
      title="Edit this link"
    >
      <span class="icon">✏️</span>
      <span>Edit</span>
    </button>

    <button
      @click="$emit('delete')"
      class="context-menu-item"
      title="Delete this link"
    >
      <span class="icon">🗑️</span>
      <span>Delete</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  show: {
    type: Boolean,
    required: true
  },
  x: {
    type: Number,
    required: true
  },
  y: {
    type: Number,
    required: true
  }
});

defineEmits(['close', 'edit', 'delete']);
</script>

<style scoped>
.context-menu-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background: transparent;
}

.context-menu {
  position: fixed;
  background: white;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  z-index: 1000;
  min-width: 180px;
}

.context-menu-item {
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #213547;
  transition: background-color 0.1s;
}

.context-menu-item:hover {
  background-color: #f6f8fa;
}

.context-menu-item .icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}
</style>
