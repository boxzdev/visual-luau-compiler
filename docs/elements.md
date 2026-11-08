# Available Elements Reference — Visual Luau Compiler

This document provides an exhaustive, authoritative catalog of all **classes, instances, GUI components, UI modifiers, lighting objects, and services** implemented and available in the **Visual Luau Compiler** project.

---

## Table of Contents
1. [Master Elements Directory](#1-master-elements-directory)
2. [3D Objects & Spatial Primitives](#2-3d-objects--spatial-primitives)
3. [Scripts & Execution Units](#3-scripts--execution-units)
4. [2D & 3D User Interface (GUI Elements)](#4-2d--3d-user-interface-gui-elements)
5. [UI Modifiers & Constraints](#5-ui-modifiers--constraints)
6. [Lighting & Environmental Effects](#6-lighting--environmental-effects)
7. [Networking & Remotes](#7-networking--remotes)
8. [Characters, Rigging & Value Elements](#8-characters-rigging--value-elements)
9. [DataModel Container Services](#9-datamodel-container-services)
10. [Engine Utility Services](#10-engine-utility-services)
11. [Datatypes & Enums Reference](#11-datatypes--enums-reference)

---

## 1. Master Elements Directory

| Class Name | Category | `Instance.new()` | Viewport Render | Properties Panel | Description |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Part** | 3D Geometry | ✅ | ✅ (Three.js) | ✅ | Core 3D primitive (Block, Ball, Cylinder). Physics simulated. |
| **SpawnLocation** | 3D Geometry | ✅ | ✅ (Three.js) | ✅ | Spawn point for character / player origin. |
| **Model** | Hierarchy | ✅ | ✅ (Group) | ✅ | Hierarchical grouping with optional `PrimaryPart`. |
| **Folder** | Hierarchy | ✅ | ❌ (Logical) | ✅ | Organizational folder for scripts, assets, and parts. |
| **Decal** | Surface Appearance | ✅ | ✅ (Texture) | ✅ | Projected 2D texture applied to a specific part face. |
| **Texture** | Surface Appearance | ✅ | ✅ (Tiled) | ✅ | Repeating 2D texture with custom U/V tiling & offset. |
| **Camera** | Viewport | ✅ | ✅ (Perspective)| ✅ | Viewport perspective camera with CFrame and FieldOfView. |
| **Terrain** | 3D World | ✅ | ✅ (Mesh) | ✅ | Voxel / geometric terrain foundation. |
| **Script** | Code Execution | ✅ | ❌ | ✅ | Server-side script running in the Server VM. |
| **LocalScript** | Code Execution | ✅ | ❌ | ✅ | Client-side script running in the Client VM. |
| **ModuleScript** | Code Execution | ✅ | ❌ | ✅ | Reusable module cached and returned by `require()`. |
| **ScreenGui** | 2D GUI Container | ✅ | ✅ (Overlay) | ✅ | Root 2D layer collector displayed on player screens. |
| **SurfaceGui** | 3D GUI Container | ✅ | ✅ (Canvas) | ✅ | 2D GUI projected onto a 3D Part's face. |
| **BillboardGui** | 3D GUI Container | ✅ | ✅ (Facing) | ✅ | Floating GUI that always rotates to face the active camera. |
| **Frame** | GUI Element | ✅ | ✅ (DOM) | ✅ | Standard rectangular 2D container element. |
| **ScrollingFrame**| GUI Element | ✅ | ✅ (DOM) | ✅ | Scrollable container with independent CanvasSize and scrollbars. |
| **TextLabel** | GUI Element | ✅ | ✅ (DOM) | ✅ | Displays styled, wrapped, formatted or rich text. |
| **TextButton** | GUI Element | ✅ | ✅ (DOM) | ✅ | Interactive clickable button with text labels. |
| **TextBox** | GUI Element | ✅ | ✅ (DOM) | ✅ | Editable text input field with focus signals. |
| **ImageLabel** | GUI Element | ✅ | ✅ (DOM) | ✅ | Displays web or rbxasset images with slicing and scaling. |
| **ImageButton** | GUI Element | ✅ | ✅ (DOM) | ✅ | Interactive clickable button rendering an image. |
| **UICorner** | UI Modifier | ✅ | ✅ (BorderRadius)| ✅ | Rounds corners of any parent GUI element using UDim. |
| **UIStroke** | UI Modifier | ✅ | ✅ (Outline) | ✅ | Adds border outlines or text stroke effects. |
| **UIPadding** | UI Modifier | ✅ | ✅ (Padding) | ✅ | Adds internal padding (top, bottom, left, right) to parent GUI. |
| **UIListLayout** | UI Constraint | ✅ | ✅ (Flexbox) | ✅ | Orders children automatically in a horizontal or vertical list. |
| **UIGridLayout** | UI Constraint | ✅ | ✅ (CSS Grid) | ✅ | Arranges children into uniform cells with custom padding. |
| **UIAspectRatioConstraint** | UI Constraint | ✅ | ✅ (Ratio) | ✅ | Enforces fixed aspect ratios across dynamic screen sizes. |
| **UISizeConstraint** | UI Constraint | ✅ | ✅ (Min/Max) | ✅ | Clamps parent GUI minimum and maximum pixel bounds. |
| **UITextSizeConstraint** | UI Constraint | ✅ | ✅ (Font Clamp)| ✅ | Clamps minimum and maximum scalable font sizes. |
| **UIGradient** | UI Modifier | ✅ | ✅ (Gradient) | ✅ | Applies smooth linear color and transparency transitions. |
| **UIScale** | UI Modifier | ✅ | ✅ (Scale) | ✅ | Multiplies scale of parent GUI and all descendants uniformly. |
| **UIPageLayout** | UI Constraint | ✅ | ✅ (Pagination)| ✅ | Paginates child elements with animated page transitions. |
| **UIFlexItem** | UI Constraint | ✅ | ✅ (Flex Grow) | ✅ | Controls flex grow, shrink, and alignment inside layouts. |
| **PointLight** | Lighting | ✅ | ✅ (Omni Light)| ✅ | Emits omnidirectional spherical light from a part. |
| **SpotLight** | Lighting | ✅ | ✅ (Cone Light)| ✅ | Emits focused cone light along a specific face vector. |
| **SurfaceLight** | Lighting | ✅ | ✅ (Face Light)| ✅ | Emits soft directional light projecting from a part face. |
| **Sky** | Environment | ✅ | ✅ (Skybox) | ✅ | 6-sided cubic skybox textures, sun/moon, and stars. |
| **Atmosphere** | Environment | ✅ | ✅ (Fog & Haze)| ✅ | Realistic Rayleigh scattering, haze, glare, and horizon decay. |
| **ColorCorrectionEffect** | Post-Processing | ✅ | ✅ (Color Filter)| ✅ | Adjusts scene Brightness, Contrast, Saturation, and TintColor. |
| **BloomEffect** | Post-Processing | ✅ | ✅ (Glow Shader)| ✅ | Creates glowing halos around intense light sources. |
| **SunRaysEffect** | Post-Processing | ✅ | ✅ (God Rays) | ✅ | Volumetric sun ray streaks radiating from the sun. |
| **BlurEffect** | Post-Processing | ✅ | ✅ (Screen Blur)| ✅ | Gaussian screen blur effect. |
| **DepthOfFieldEffect** | Post-Processing | ✅ | ✅ (DoF Blur) | ✅ | Simulates camera focal blur outside the focus distance. |
| **RemoteEvent** | Networking | ✅ | ❌ | ✅ | Asynchronous cross-VM client/server messaging. |
| **RemoteFunction** | Networking | ✅ | ❌ | ✅ | Synchronous two-way request/response remote calls. |
| **Motor6D** | Rigging & Constraints | ✅ | ❌ (Rigging) | ✅ | Rigid joint connecting two parts with transform offsets for character animation rigs. |
| **Attachment** | 3D Spatial & Rigging | ✅ | ✅ (Gizmo) | ✅ | 3D spatial anchor and coordinate frame attached to a BasePart. |
| **HumanoidDescription** | Character Avatar | ✅ | ❌ (Data) | ✅ | Configures humanoid avatar appearance, scales, body colors, clothing, and accessories. |
| **Humanoid** | Character Controller | ✅ | ❌ (Logical) | ✅ | Core avatar controller handling health, movement physics, jump, states, and animation. |
| **Animator** | Animation | ✅ | ❌ (Logical) | ✅ | Evaluates and plays animation tracks on Humanoid or AnimationController. |
| **Status** | Character Status | ✅ | ❌ (Logical) | ✅ | Character status indicator instance used for gameplay status conditions. |
| **BodyColors** | Character Appearance | ✅ | ❌ (Logical) | ✅ | Configures individual limb colors for character models (Head, Torso, Arms, Legs). |
| **StringValue** | Data & Values | ✅ | ❌ (Logical) | ✅ | Data storage object holding a string Value with a Changed event. |

---

## 2. 3D Objects & Spatial Primitives

### `Part`
The fundamental 3D building block in the workspace.
- **Shapes**: `Block`, `Ball`, `Cylinder`.
- **Materials**: `Plastic`, `SmoothPlastic`, `Neon` (glows with Bloom), `Metal`, `Glass`, `Wood`, `WoodPlanks`, `CorrodedMetal`, `DiamondPlate`, `Foil`, `Grass`, `Ice`, `Brick`, `Sand`, `Fabric`, `Granite`, `Marble`.
- **Physical Properties**:
  - `Anchored`: When `false`, the 3D physics engine simulates gravity, mass, linear velocity, angular velocity, friction, restitution, and collisions.
  - `CanCollide`, `CanTouch`, `CanQuery`, `Massless`.
  - `Size`: `Vector3.new(x, y, z)`.
  - `Position`: `Vector3.new(x, y, z)`.
  - `CFrame`: Full 4x4 spatial transform matrix (position + 3D orientation).
  - `Color` / `BrickColor`: Surface color tint.
  - `Transparency` (0 to 1), `Reflectance` (0 to 1).

### `SpawnLocation`
Inherits all properties of `Part`, acting as the designated spawn origin for player characters.

### `Model`
A container for grouping multiple 3D parts and sub-assemblies.
- **Properties**: `PrimaryPart` (`Part` instance).
- **Methods**: `:GetBoundingBox()`, `:MoveTo(position)`, `:SetPrimaryPartCFrame(cf)`.

### `Folder`
A purely logical container used to organize scripts, remotes, configurations, and models without introducing spatial transforms.

### `Decal` & `Texture`
Surface appearance objects parented to a `Part`.
- **Properties**:
  - `Texture`: Image URL or asset ID.
  - `Face`: `Front`, `Back`, `Top`, `Bottom`, `Left`, `Right`.
  - `Transparency`: 0 to 1.
  - `StudsPerTileU`, `StudsPerTileV`, `OffsetStudsU`, `OffsetStudsV` *(Texture only)*.

---

## 3. Scripts & Execution Units

| Script Type | Target Environment | Global Context | Characteristics |
| :--- | :--- | :--- | :--- |
| **`Script`** | Server VM | `game.ServerScriptService`, `game.ServerStorage` | Executes server logic. Has access to `RemoteEvent.OnServerEvent` and can call `:FireClient()` / `:FireAllClients()`. |
| **`LocalScript`** | Client VM | `game.Players.LocalPlayer`, `PlayerGui`, `UserInputService` | Executes client logic. Reacts to user clicks, keyboard events, and can call `:FireServer()`. |
| **`ModuleScript`** | Shared | Loaded via `require(moduleInstance)` | Pure Lua table or function definition cached upon first invocation. Reusable across both client and server scripts. |

---

## 4. 2D & 3D User Interface (GUI Elements)

### Layer Collectors (Roots)
- **`ScreenGui`**: Parented to `StarterGui` or `PlayerGui`. Renders directly as a 2D screen HUD.
  - *Properties*: `Enabled`, `IgnoreGuiInset`, `ResetOnSpawn`, `DisplayOrder`, `ZIndexBehavior`.
- **`SurfaceGui`**: Projected onto a face of a 3D `Part`.
  - *Properties*: `Adornee`, `Face`, `CanvasSize`, `PixelsPerStud`, `LightInfluence`, `AlwaysOnTop`.
- **`BillboardGui`**: Floats in 3D space above a part, always facing the camera.
  - *Properties*: `Adornee`, `Size`, `StudsOffset`, `AlwaysOnTop`, `MaxDistance`, `DistanceLowerLimit`, `DistanceUpperLimit`.

### Core 2D Elements
- **`Frame`**: Basic rectangular division.
- **`ScrollingFrame`**: Scrollable container with `CanvasSize`, `CanvasPosition`, `ScrollBarThickness`, and `AutomaticCanvasSize`.
- **`TextLabel` / `TextButton` / `TextBox`**: Text rendering with `Text`, `TextColor3`, `TextSize`, `Font`, `TextScaled`, `TextWrapped`, `RichText`, and alignment.
- **`ImageLabel` / `ImageButton`**: Image display with `Image`, `ImageColor3`, `ScaleType` (`Stretch`, `Slice`, `Tile`, `Fit`), `SliceScale`, and `TileSize`.

---

## 5. UI Modifiers & Constraints

UI Modifiers enhance and control the layout of GUI elements automatically:

```mermaid
graph TD
    ParentGUI["Parent GuiObject (Frame / Button / Label)"] --> UICorner["UICorner (Rounded Corners)"]
    ParentGUI --> UIStroke["UIStroke (Border / Text Outline)"]
    ParentGUI --> UIPadding["UIPadding (Internal Margins)"]
    ParentGUI --> UIListLayout["UIListLayout (Vertical / Horizontal Flow)"]
    ParentGUI --> UIGridLayout["UIGridLayout (Cell Matrix)"]
    ParentGUI --> UIAspectRatioConstraint["UIAspectRatioConstraint (Fixed Ratio)"]
    ParentGUI --> UIGradient["UIGradient (Color / Fade Transitions)"]
    ParentGUI --> UIScale["UIScale (Resolution Scaling)"]
```

- **`UICorner`**: `CornerRadius` (`UDim`).
- **`UIStroke`**: `Thickness`, `Color`, `Transparency`, `ApplyStrokeMode` (`Border`, `Contextual`), `LineJoinMode`.
- **`UIPadding`**: `PaddingTop`, `PaddingBottom`, `PaddingLeft`, `PaddingRight` (`UDim`).
- **`UIListLayout`**: `FillDirection`, `HorizontalAlignment`, `VerticalAlignment`, `Padding`, `SortOrder`.
- **`UIGridLayout`**: `CellSize` (`UDim2`), `CellPadding`, `StartCorner`, `FillDirectionMaxCells`.
- **`UIAspectRatioConstraint`**: `AspectRatio`, `AspectType`, `DominantAxis`.
- **`UISizeConstraint`**: `MinSize`, `MaxSize` (`Vector2`).
- **`UITextSizeConstraint`**: `MinTextSize`, `MaxTextSize`.
- **`UIGradient`**: `Color`, `Transparency`, `Rotation`, `Offset`.
- **`UIScale`**: `Scale` (multiplier factor).
- **`UIPageLayout`**: `Animated`, `Circular`, `EasingStyle`, `EasingDirection`, `TweenTime`.
- **`UIFlexItem`**: `FlexMode`, `ItemLineAlignment`, `GrowRatio`, `ShrinkRatio`.

---

## 6. Lighting & Environmental Effects

Parented inside `game.Lighting`:

### Lights
- **`PointLight`**: `Brightness`, `Color`, `Range`, `Shadows`, `Enabled`.
- **`SpotLight`**: `Angle`, `Face`, `Brightness`, `Color`, `Range`, `Shadows`, `Enabled`.
- **`SurfaceLight`**: `Face`, `Angle`, `Brightness`, `Color`, `Range`, `Shadows`, `Enabled`.

### Environment
- **`Sky`**: `SkyboxBk`, `SkyboxDn`, `SkyboxFt`, `SkyboxLf`, `SkyboxRt`, `SkyboxUp`, `SunTextureId`, `MoonTextureId`, `SunAngularSize`, `MoonAngularSize`, `CelestialBodiesShown`, `StarCount`.
- **`Atmosphere`**: `Density`, `Offset`, `Decay`, `Glare`, `Haze`.

### Post-Processing Shaders
- **`BloomEffect`**: `Intensity`, `Size`, `Threshold`.
- **`BlurEffect`**: `Size` (pixels).
- **`ColorCorrectionEffect`**: `Brightness`, `Contrast`, `Saturation`, `TintColor`.
- **`SunRaysEffect`**: `Intensity`, `Spread`.
- **`DepthOfFieldEffect`**: `FarIntensity`, `FocusDistance`, `InFocusRadius`, `NearIntensity`.

---

## 7. Networking & Remotes

Enables communication across the dual-runtime boundary (Server VM ↔ Client VM):

### `RemoteEvent`
One-way event triggering:
- **Server Script**:
  - `event:FireClient(player, ...)`
  - `event:FireAllClients(...)`
  - `event.OnServerEvent:Connect(function(player, ...) end)`
- **LocalScript**:
  - `event:FireServer(...)`
  - `event.OnClientEvent:Connect(function(...) end)`

### `RemoteFunction`
Two-way request/response invoking:
- **Server Script**:
  - `func.OnServerInvoke = function(player, ...) return result end`
  - `result = func:InvokeClient(player, ...)`
- **LocalScript**:
  - `result = func:InvokeServer(...)`
  - `func.OnClientInvoke = function(...) return result end`

---

## 8. Characters, Rigging & Value Elements

### `Humanoid`
The central controller instance that brings character models and avatars to life with health, physics locomotion, jumping, and animation state management.
- **Properties**:
  - `Health` (number, default 100): Current health level of character.
  - `MaxHealth` (number, default 100): Maximum allowable health.
  - `WalkSpeed` (number, default 16): Studs/sec forward locomotion speed.
  - `JumpPower` (number, default 50): Upward impulse power when jumping.
  - `JumpHeight` (number, default 7.2): Target jump height when `UseJumpPower` is false.
  - `HipHeight` (number, default 2): Standing offset distance above terrain/floor.
  - `RigType` (`"R15"` | `"R6"`): Skeletal joint rig standard.
  - `DisplayName` (string): In-game character overhead name display.
  - `AutoRotate` (boolean, default true): Automatically aligns facing towards movement direction.
  - `PlatformStand`, `Sit` (boolean).
  - `UseJumpPower` (boolean, default true).
  - `RequiresNeck` (boolean, default true).
- **Methods**:
  - `:TakeDamage(amount)`: Inflicts damage and automatically fires `HealthChanged` and `Died`.
  - `:MoveTo(Vector3)`: Directs the character model towards a target 3D coordinate.
  - `:ChangeState(HumanoidStateType)`: Forces a transition into another humanoid state.
  - `:GetState()`: Returns the active humanoid state.
  - `:ApplyDescription(HumanoidDescription)`: Applies character customization properties.
  - `:GetAppliedDescription()`: Retrieves the current active avatar appearance description.
- **Events**:
  - `.Died`: Fires when health drops to 0.
  - `.HealthChanged(newHealth)`: Fires upon any health modification.
  - `.StateChanged(oldState, newState)`: Fires on locomotion or state changes.
  - `.Running(speed)`, `.Jumping(active)`, `.Climbing(speed)`, `.Freefall(active)`, `.Seated(isSeated)`.
  - `.MoveToFinished(reachedTarget)`: Fires when character reaches its MoveTo location.

### `HumanoidDescription`
Data configuration asset specifying the complete visual avatar appearance including limb colors, body proportions, clothing, and accessory attachments.
- **Properties**:
  - `HeadColor`, `TorsoColor`, `LeftArmColor`, `RightArmColor`, `LeftLegColor`, `RightLegColor` (`Color3`).
  - `HeightScale`, `WidthScale`, `HeadScale`, `DepthScale` (numbers, default 1.0).
  - `BodyTypeScale`, `ProportionScale` (numbers, default 0.0).
  - `Shirt`, `Pants`, `GraphicTShirt`, `Face`, `Head` (asset IDs or URLs).
  - Accessories: `HairAccessory`, `HatAccessory`, `FaceAccessory`, `NeckAccessory`, `ShouldersAccessory`, `FrontAccessory`, `BackAccessory`, `WaistAccessory`.
  - Animations: `ClimbAnimation`, `FallAnimation`, `IdleAnimation`, `JumpAnimation`, `RunAnimation`, `SwimAnimation`, `WalkAnimation`.

### `Animator`
Animation evaluation unit typically parented under a `Humanoid` or `AnimationController`.
- **Methods**:
  - `:LoadAnimation(animation)`: Instantiates a playable `AnimationTrack`.
  - `:GetPlayingAnimationTracks()`: Returns currently active playing tracks.
  - `:StepAnimations(deltaTime)`.
- **AnimationTrack**:
  - Properties: `IsPlaying`, `Length`, `Speed`, `TimePosition`, `Looped`, `Priority`.
  - Methods: `:Play(fadeTime, weight, speed)`, `:Stop(fadeTime)`, `:AdjustSpeed(speed)`, `:AdjustWeight(weight)`.
  - Events: `.Stopped`, `.KeyframeReached`, `.DidLoop`.

### `Motor6D`
Rigid animated 6-degree-of-freedom joint connecting two `BasePart` instances (`Part0` and `Part1`), forming the basis of all character animation rigs.
- **Properties**:
  - `Part0` (`BasePart`): The primary root or parent part in the joint hierarchy.
  - `Part1` (`BasePart`): The connected child limb or sub-assembly.
  - `C0` (`CFrame`): 3D offset transform relative to `Part0`.
  - `C1` (`CFrame`): 3D offset transform relative to `Part1`.
  - `Transform` (`CFrame`): Animated relative joint offset driven by animation tracks.
  - `CurrentAngle`, `DesiredAngle`, `MaxVelocity` (numbers).
  - `Enabled` (boolean).

### `Attachment`
Spatial point and coordinate frame anchor parented to a `BasePart`.
- **Properties**:
  - `Position` (`Vector3`): Local 3D position relative to the parent part.
  - `Orientation` (`Vector3`): Local Euler rotation.
  - `Axis`, `SecondaryAxis` (`Vector3`): Direction axes for constraints and hinges.
  - `WorldPosition`, `WorldOrientation`, `WorldCFrame` (world-space coordinates).
  - `Visible` (boolean): When true or selected, renders an interactive 3D axes gizmo in the Viewport.

### `BodyColors`
Limb color configuration instance parented under a character `Model`.
- **Properties**:
  - `HeadColor3`, `TorsoColor3`, `LeftArmColor3`, `RightArmColor3`, `LeftLegColor3`, `RightLegColor3` (`Color3`).
  - Backward-compatible BrickColor accessors: `HeadColor`, `TorsoColor`, etc.

### `Status`
Legacy character and entity condition indicator instance used to track gameplay status effects, shields, or active buffs.
- **Properties**: `Name`, `ClassName`, `Parent`, `Archivable`.

### `StringValue`
Primitive value container storing a text string in the hierarchy with change detection.
- **Properties**:
  - `Value` (string): The stored string text.
- **Events**:
  - `.Changed(newValue)`: Fires whenever `Value` changes with the new string.
  - `:GetPropertyChangedSignal("Value")`: Signal firing on value modification.

---

## 9. DataModel Container Services

Root service nodes available in the Explorer hierarchy via `game:GetService("ServiceName")` or `game.ServiceName`:

1. **`Workspace`** (`workspace`): Holds all physical 3D parts, models, terrain, and camera.
2. **`Lighting`**: Controls global clock time, fog, shadows, ambient lighting, and sky effects.
3. **`ReplicatedStorage`**: Replicated to both server and client; ideal for shared modules, configurations, and remotes.
4. **`ServerScriptService`**: Secure server container for `Script` execution; client has zero access.
5. **`ServerStorage`**: Server-only asset and template storage.
6. **`StarterGui`**: Cloned into each player's `PlayerGui` on join/spawn.
7. **`StarterPlayer`**: Houses `StarterPlayerScripts` and `StarterCharacterScripts`.
8. **`StarterPack`**: Tools and items equipped to players.
9. **`SoundService`**: Global audio settings and listener positioning.
10. **`Teams`**: Manages player team assignments and friendly fire.
11. **`MaterialService`**: Custom material overrides and physical definitions.

---

## 9. Engine Utility Services

| Service Name | Description | Key Methods & Events |
| :--- | :--- | :--- |
| **`TweenService`** | Smooth parameter interpolation | `:Create(instance, tweenInfo, { Property = target })`, `:Play()`, `:Pause()`, `:Cancel()`. |
| **`RunService`** | Frame-by-frame loop events | `.Heartbeat`, `.RenderStepped`, `.Stepped`, `:IsServer()`, `:IsClient()`, `:IsStudio()`. |
| **`UserInputService`** | Client input polling | `.InputBegan`, `.InputEnded`, `.MouseMoved`, `:IsKeyDown(keyCode)`. |
| **`CollectionService`** | Tag-based entity management | `:AddTag(inst, tag)`, `:RemoveTag(inst, tag)`, `:HasTag(inst, tag)`, `:GetTagged(tag)`. |
| **`Debris`** | Garbage collection timed cleanup | `:AddItem(instance, lifetimeSeconds)`. |
| **`HttpService`** | Data serialization & UUIDs | `:JSONEncode(tbl)`, `:JSONDecode(jsonStr)`, `:GenerateGUID(wrapInBraces)`. |
| **`PathfindingService`** | Navigation mesh path calculation | `:CreatePath(options)`, `path:ComputeAsync(start, target)`. |
| **`ContextActionService`** | Action-to-key binding manager | `:BindAction(name, callback, createTouchBtn, ...keys)`, `:UnbindAction(name)`. |
| **`Players`** | Player list and local player | `.LocalPlayer`, `:GetPlayers()`, `.PlayerAdded`, `.PlayerRemoving`. |
| **`TeleportService`** | Place teleportation mock | `:Teleport(placeId, player)`. |
| **`MarketplaceService`** | Developer product & gamepass API | `:PromptPurchase(player, assetId)`, `:UserOwnsGamePassAsync(userId, passId)`. |

---

## 10. Datatypes & Enums Reference

Available in the Lua execution environment without imports:

- **`Vector3`**: `Vector3.new(x, y, z)`, `Vector3.zero`, `Vector3.one`, `:Dot(v)`, `:Cross(v)`, `:Lerp(v, alpha)`, `.Magnitude`, `.Unit`.
- **`Vector2`**: `Vector2.new(x, y)`, `Vector2.zero`, `.Magnitude`.
- **`CFrame`**: `CFrame.new(...)`, `CFrame.Angles(rx, ry, rz)`, `CFrame.lookAt(eye, target)`, `:Inverse()`, `:Lerp(target, alpha)`, `.Position`, `.LookVector`, `.RightVector`, `.UpVector`.
- **`Color3`**: `Color3.new(r, g, b)`, `Color3.fromRGB(r, g, b)`, `Color3.fromHSV(h, s, v)`, `Color3.fromHex(hex)`, `:Lerp(c, alpha)`.
- **`BrickColor`**: `BrickColor.new(nameOrIndex)`, `BrickColor.random()`, predefined colors (`Red`, `Blue`, `White`, etc.).
- **`UDim`**: `UDim.new(scale, offset)`.
- **`UDim2`**: `UDim2.new(xScale, xOffset, yScale, yOffset)`, `UDim2.fromScale(x, y)`, `UDim2.fromOffset(x, y)`.
- **`TweenInfo`**: `TweenInfo.new(time, easingStyle, easingDirection, repeatCount, reverses, delayTime)`.
- **`NumberRange`**: `NumberRange.new(min, max)`.
- **`ColorSequence`** & **`NumberSequence`**: Multi-keypoint sequence definitions.
- **`Enum`**: `Enum.Material`, `Enum.EasingStyle`, `Enum.EasingDirection`, `Enum.Font`, `Enum.ScaleType`, `Enum.FillDirection`, `Enum.ApplyStrokeMode`, `Enum.SortOrder`, `Enum.StartCorner`, `Enum.AutomaticSize`, `Enum.SizeConstraint`, etc.
