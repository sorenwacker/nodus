/**
 * A click outside the plan dialog does not close it
 * (PRODUCT_DESIGN.md > A created plan is presented).
 *
 * The dialog appears while the user may be clicking on the canvas, and closing
 * only hid it: the plan stayed pending and could not be reopened.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import PlanApprovalModal from '../components/PlanApprovalModal.vue'

function mountDialog() {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  return mount(PlanApprovalModal, {
    props: {
      visible: true,
      plan: {
        id: 'p1',
        title: 'Tidy the graph',
        status: 'pending_approval',
        createdAt: 0,
        steps: [{ id: 's1', description: 'Group the notes', status: 'pending' }],
      },
    },
    global: { plugins: [i18n], stubs: { Teleport: true } },
  })
}

describe('the plan dialog', () => {
  it('stays open when the backdrop is clicked', async () => {
    const dialog = mountDialog()
    await dialog.find('.plan-modal-overlay').trigger('click')
    expect(dialog.emitted('close')).toBeUndefined()
  })

  it('closes through its close button', async () => {
    const dialog = mountDialog()
    await dialog.find('.close-btn').trigger('click')
    expect(dialog.emitted('close')).toHaveLength(1)
  })
})
