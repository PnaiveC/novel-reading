import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../../src/App.vue'

describe('App 外壳', () => {
  it('正常渲染占位界面', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('小说阅读器')
  })
})
