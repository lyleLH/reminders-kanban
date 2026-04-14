const { test, expect } = require('@playwright/test');
const { readFileSync } = require('fs');
const { join } = require('path');

const mockScript = readFileSync(join(__dirname, 'mock-invoke.js'), 'utf-8');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mockScript);
  await page.goto('/');
  await page.waitForSelector('.col', { timeout: 5000 });
});

test.describe('列表切换', () => {
  test('显示列表 tab 并可切换', async ({ page }) => {
    const tabs = page.locator('.project-btn');
    await expect(tabs.first()).toBeVisible();
    const secondTab = tabs.nth(1);
    await secondTab.click();
    await expect(secondTab).toHaveClass(/active/);
  });

  test('+ 按钮可创建新列表', async ({ page }) => {
    await page.locator('.add-list-btn').click();
    const input = page.locator('.new-list-input');
    await expect(input).toBeVisible();
    await input.fill('新测试列表');
    await input.press('Enter');
    await expect(page.locator('.project-btn', { hasText: '新测试列表' })).toBeVisible();
  });
});

test.describe('任务 CRUD', () => {
  test('新增任务', async ({ page }) => {
    const input = page.locator('.add-input');
    await input.fill('自动化新增的任务');
    await input.press('Enter');
    await expect(page.locator('.card', { hasText: '自动化新增的任务' })).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
  });

  test('点击卡片打开详情面板', async ({ page }) => {
    await page.locator('.card').first().click();
    await expect(page.locator('#detail-overlay')).toBeVisible();
    await expect(page.locator('.detail-title')).toBeVisible();
    await expect(page.locator('.detail-close')).toBeVisible();
  });

  test('详情面板编辑标题', async ({ page }) => {
    await page.locator('.card').first().click();
    const titleInput = page.locator('.detail-title');
    await titleInput.fill('修改后的标题');
    await page.locator('.detail-close').click();
    await expect(page.locator('#detail-overlay')).not.toBeVisible();
  });

  test('删除按钮需双击确认', async ({ page }) => {
    await page.locator('.card').first().click();
    const deleteBtn = page.locator('.delete-btn');
    await deleteBtn.click();
    await expect(deleteBtn).toHaveClass(/confirm/);
    await deleteBtn.click();
    await expect(page.locator('#detail-overlay')).not.toBeVisible();
  });

  test('标记完成', async ({ page }) => {
    // 找到"设计首页"这张卡片（一定在待办列）
    const card = page.locator('.col[data-status="待办"] .card', { hasText: '设计首页' });
    await expect(card).toBeVisible();
    await card.click();
    await page.locator('.complete-btn').click();
    await expect(page.locator('#detail-overlay')).not.toBeVisible();
    // 完成后不应再出现在待办列
    await expect(page.locator('.col[data-status="待办"] .card', { hasText: '设计首页' })).not.toBeVisible();
  });
});

test.describe('子任务', () => {
  test('添加子任务', async ({ page }) => {
    await page.locator('.card', { hasText: '编写测试' }).click();
    const input = page.locator('.subtask-input');
    await input.fill('新子任务');
    await input.press('Enter');
    await expect(page.locator('.subtask-row', { hasText: '新子任务' })).toBeVisible();
    await expect(input).toHaveValue('');
  });

  test('子任务 checkbox 切换', async ({ page }) => {
    await page.locator('.card', { hasText: '编写测试' }).click();
    const checkbox = page.locator('.subtask-row').first().locator('input[type="checkbox"]');
    const wasChecked = await checkbox.isChecked();
    await checkbox.click();
    if (wasChecked) await expect(checkbox).not.toBeChecked();
    else await expect(checkbox).toBeChecked();
  });
});

test.describe('看板结构', () => {
  test('三列存在且状态正确', async ({ page }) => {
    const cols = page.locator('.col');
    await expect(cols).toHaveCount(3);
    await expect(cols.nth(0)).toHaveAttribute('data-status', '待办');
    await expect(cols.nth(1)).toHaveAttribute('data-status', '进行中');
    await expect(cols.nth(2)).toHaveAttribute('data-status', '已完成');
  });

  test('卡片在正确的列中', async ({ page }) => {
    await expect(page.locator('.col[data-status="待办"] .card', { hasText: '设计首页' })).toBeVisible();
    await expect(page.locator('.col[data-status="进行中"] .card', { hasText: '修复 bug' })).toBeVisible();
    await expect(page.locator('.col[data-status="已完成"] .card', { hasText: '已部署' })).toBeVisible();
  });
});

test.describe('设置', () => {
  test('打开/关闭设置页面', async ({ page }) => {
    await page.locator('#settings-toggle').click();
    await expect(page.locator('#settings-view')).toBeVisible();
    await expect(page.locator('#kanban-view')).not.toBeVisible();
    await page.locator('#settings-toggle').click();
    await expect(page.locator('#kanban-view')).toBeVisible();
  });

  test('缩放按钮', async ({ page }) => {
    await page.locator('#settings-toggle').click();
    const val = page.locator('#scale-value');
    const before = await val.textContent();
    await page.locator('.size-btn[data-action="increase"]').click();
    const after = await val.textContent();
    expect(after).not.toBe(before);
  });

  test('主题切换', async ({ page }) => {
    await page.locator('#settings-toggle').click();
    await page.locator('.theme-opt[data-theme="glass"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'glass');
    await page.locator('.theme-opt[data-theme="shadcn"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'shadcn');
  });
});

test.describe('拖拽改状态', () => {
  test('拖卡片到进行中列', async ({ page }) => {
    const card = page.locator('.col[data-status="待办"] .card', { hasText: '设计首页' });
    const targetCol = page.locator('.col[data-status="进行中"]');
    await expect(card).toBeVisible();

    const cardBox = await card.boundingBox();
    const colBox = await targetCol.boundingBox();

    // 模拟 mousedown → mousemove（超过5px阈值）→ mouseup
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    // 先移动一小段触发 dragState.started
    await page.mouse.move(cardBox.x + 10, cardBox.y + 10, { steps: 2 });
    // 移到目标列中心
    await page.mouse.move(colBox.x + colBox.width / 2, colBox.y + colBox.height / 2, { steps: 5 });
    await page.mouse.up();

    // "设计首页"应该出现在进行中列
    await expect(page.locator('.col[data-status="进行中"] .card', { hasText: '设计首页' })).toBeVisible({ timeout: 3000 });
  });
});

test.describe('键盘快捷键', () => {
  test('Escape 关闭详情', async ({ page }) => {
    await page.locator('.card').first().click();
    const overlay = page.locator('#detail-overlay');
    await expect(overlay).toBeVisible();
    // 确保焦点在 overlay 内
    await page.locator('.detail-title').click();
    await page.keyboard.press('Escape');
    await expect(overlay).not.toBeVisible();
  });
});

test.describe('Twemoji', () => {
  test('emoji 渲染为 SVG 图片', async ({ page }) => {
    const card = page.locator('.card', { hasText: '修复 bug' });
    const emojiImg = card.locator('img.emoji');
    await expect(emojiImg).toBeVisible();
  });
});
