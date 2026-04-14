# Reminders Kanban — Design System

## 两套主题

| | shadcn | Glass |
|---|---|---|
| 边框 | `1px solid var(--border)` | **零边框** — `border-color: transparent !important` 全局强制 |
| 分隔 | 边框线 | 阴影 + 半透明背景层次 |
| 面板背景 | 实色 `var(--card)` | `backdrop-filter: blur` 毛玻璃 |
| 卡片 | 实色 + 边框 | **实色不透明** + 阴影，不用玻璃 |
| 详情面板 | 实色 | **实色不透明**，不用玻璃 |
| 输入框 | 边框 + 白底 | 无边框 + 灰色填充底 |
| 圆角 | `10px` | `14px` |
| 字体 | Nunito | SF Pro (system-ui) |

## Glass 主题元素分类

| 元素 | 背景 | 效果 | 说明 |
|------|------|------|------|
| **Titlebar** | `var(--background)` | `backdrop-filter: blur` + 阴影 | 毛玻璃 |
| **Active Tab** | `var(--background)` | `backdrop-filter: blur` + `var(--glass-shadow)` + `var(--glass-highlight)` | 毛玻璃，与列保持一致 |
| **列 (Column)** | `var(--background)` | `backdrop-filter: blur` + `var(--glass-shadow)` + `var(--glass-highlight)` | 毛玻璃 |
| **卡片 (Card)** | 实色 `hsl(0 0% 100%)` / 暗色 `hsl(230 6% 16%)` | 仅 `box-shadow`，无 blur | **不用毛玻璃** |
| **详情面板** | 实色 `hsl(0 0% 100%)` / 暗色 `hsl(230 6% 14%)` | 仅大号阴影，无 blur | **不用毛玻璃** |
| **输入框** | 灰色填充 `hsl(220 10% 95%)` / 暗色 `hsl(230 6% 20%)` | 无边框 | 用 `!important` 强制 |
| **设置页 section** | `var(--background)` | `backdrop-filter: blur` + 阴影 + 高光 | 毛玻璃 |
| **Emoji Picker (popover)** | `var(--background)` | `backdrop-filter: blur(40px) saturate(1.4)` | 毛玻璃 |
| **Badge / Count** | `rgba(255,255,255,0.3)` / 暗色 `rgba(255,255,255,0.06)` | `backdrop-filter: blur(8px)` | 轻度毛玻璃 |

**关键规则**：所有毛玻璃元素必须使用相同的 `var(--background)` + `var(--glass-shadow)` + `var(--glass-highlight)` 组合，确保视觉一致性。不同透明度 = 不同质感 = 视觉混乱。

## 新增组件必须遵守的规则

1. **只用 CSS 变量**：`var(--border)`, `var(--card)`, `var(--muted)` 等，不写死颜色值
2. **不写 Glass 主题覆盖**：`[data-theme="glass"] * { border-color: transparent !important }` 已全局生效，新组件的边框会自动消失
3. **如果需要 Glass 下可见的分隔**：用 `box-shadow` 或 `var(--glass-border)`，不用 `border`
4. **卡片和详情面板**：永远实色，不加 `backdrop-filter`
5. **优先级颜色**：红 `hsl(0 72% 51%)` / 橙 `hsl(38 92% 50%)` / 蓝 `hsl(211 80% 55%)`
6. **暗色模式**：badge/按钮 active 状态要写 `@media (prefers-color-scheme: dark)` 覆盖

## CSS 变量表

```css
/* 两个主题共用 */
--background    /* 页面/列背景 */
--foreground    /* 主文字色 */
--card          /* 卡片/面板背景 */
--muted         /* 次要背景（badge/count/输入框底） */
--muted-fg      /* 次要文字色 */
--border        /* 边框色（Glass 下为 transparent） */
--primary       /* 主操作色 */
--primary-fg    /* 主操作前景 */
--accent        /* hover 背景 */
--ring          /* focus 环色 */
--radius        /* 圆角半径 */
--font          /* 字体族 */

/* Glass 专用 */
--glass-blur       /* 模糊半径 24px */
--glass-border     /* 半透明白边（用于需要可见分隔的地方） */
--glass-shadow     /* 标准阴影 */
--glass-shadow-lg  /* 大号阴影 */
--glass-highlight  /* 顶部高光 inset */
```

## 组件模板

新建组件时复制这个结构：

```css
.my-component {
  background: var(--card);
  border: 1px solid var(--border);  /* Glass 下自动透明 */
  border-radius: var(--radius);
  color: var(--foreground);
  font-family: var(--font);
}
.my-component:hover {
  background: var(--accent);
}
```

不需要写 `[data-theme="glass"] .my-component { ... }`。

## 空间不够时的处理

当 modal/panel 内展开 picker/popover 空间不够时：
- **不缩放全局 zoom**
- **不做 transform 动画**
- 隐藏同级内容（如 detail-body）给 picker 腾空间，关闭后恢复
