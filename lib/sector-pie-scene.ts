import {
  AmbientLight,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  Raycaster,
  Scene,
  Shape,
  Vector2,
  WebGLRenderer,
} from "three";

export type PieSlice = { name: string; value: number; color: string };

export function createSectorPie(
  host: HTMLElement,
  slices: PieSlice[],
  onSelect: (name: string) => void,
  onHover: (name: string) => void,
) {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  host.appendChild(renderer.domElement);
  const scene = new Scene();
  const camera = new OrthographicCamera(-3, 3, 2.4, -2.4, 0.1, 30);
  camera.position.set(0, -7, 7);
  camera.lookAt(0, 0, 0);
  scene.add(new AmbientLight(0xffffff, 2));
  const light = new DirectionalLight(0xffffff, 3);
  light.position.set(-3, -4, 8);
  scene.add(light);
  const group = new Group();
  scene.add(group);
  function makeMeshes(items: PieSlice[]) {
    const total = items.reduce((sum, slice) => sum + slice.value, 0);
    let angle = Math.PI / 2;
    return items.map((slice) => {
      const sweep = (slice.value / total) * Math.PI * 2;
      const shape = new Shape();
      shape.moveTo(0, 0);
      shape.lineTo(Math.cos(angle) * 2, Math.sin(angle) * 2);
      shape.absarc(0, 0, 2, angle, angle + sweep, false);
      shape.lineTo(0, 0);
      const geometry = new ExtrudeGeometry(shape, {
        depth: 0.75,
        bevelEnabled: false,
        curveSegments: 48,
        steps: 1,
      });
      const mesh = new Mesh(geometry, new MeshLambertMaterial({ color: slice.color }));
      mesh.frustumCulled = false;
      mesh.userData = {
        name: slice.name,
        angle: angle + sweep / 2,
        start: angle,
        sweep,
        positions: geometry.attributes.position.array.slice(),
      };
      angle += sweep;
      group.add(mesh);
      return mesh;
    });
  }
  let meshes = makeMeshes(slices);
  function clearMeshes(items = meshes) {
    items.forEach((mesh) => {
      group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
  }
  let pending: PieSlice[] | null = null;
  let transitionStart = 0;
  let outgoing: typeof meshes = [];
  let origin = { start: Math.PI / 2, sweep: Math.PI * 2, angle: 0 };
  const smooth = (value: number) => {
    const bounded = Math.max(0, Math.min(1, value));
    return bounded * bounded * bounded * (bounded * (bounded * 6 - 15) + 10);
  };

  function opacity(mesh: (typeof meshes)[number], value: number) {
    mesh.material.transparent = value < 1;
    mesh.material.opacity = value;
    mesh.material.depthWrite = value >= 1;
  }

  // Reuse vertex buffers while the detached wedge unfolds into a complete pie.
  function unfold(progress: number) {
    for (const mesh of meshes) {
      const position = mesh.geometry.attributes.position;
      const original = mesh.userData.positions as Float32Array;
      for (let index = 0; index < position.count; index++) {
        const x = original[index * 3];
        const y = original[index * 3 + 1];
        const radius = Math.hypot(x, y);
        let angle = Math.atan2(y, x);
        while (angle < mesh.userData.start - 0.0001) angle += Math.PI * 2;
        const fraction = (angle - Math.PI / 2) / (Math.PI * 2);
        const compressed = origin.start + fraction * origin.sweep;
        const current = compressed + (angle - compressed) * progress;
        position.setXY(index, Math.cos(current) * radius, Math.sin(current) * radius);
      }
      position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.position.set(
        Math.cos(origin.angle) * 0.7 * (1 - progress),
        Math.sin(origin.angle) * 0.7 * (1 - progress),
        0.3 * (1 - progress),
      );
    }
  }
  let selected = "";
  let hovered = "";
  let frame = 0;
  let visible = true;
  let previousTime = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Render only during short transitions; a settled chart uses no animation loop.
  function render(time: number) {
    frame = 0;
    const delta = Math.min(64, time - previousTime || 16);
    previousTime = time;
    const easing = reducedMotion.matches ? 1 : 1 - Math.exp(-delta / 65);
    let moving = false;
    if (pending) {
      const elapsed = reducedMotion.matches ? 1400 : time - transitionStart;
      const detach = smooth(elapsed / 450);
      if (!outgoing.length && elapsed < 450) {
        for (const mesh of meshes) {
          const focused = mesh.userData.name === selected;
          const distance = focused ? 0.025 + detach * 0.675 : 0.025;
          mesh.position.set(
            Math.cos(mesh.userData.angle) * distance,
            Math.sin(mesh.userData.angle) * distance,
            focused ? detach * 0.3 : 0,
          );
          opacity(mesh, focused ? 1 : 1 - detach);
        }
      }
      if (elapsed >= 450 && !outgoing.length) {
        outgoing = meshes;
        meshes = makeMeshes(pending);
      }
      if (elapsed >= 450) {
        const rebuild = smooth((elapsed - 450) / 850);
        const blend = smooth((elapsed - 450) / 180);
        outgoing.forEach((mesh) =>
          opacity(mesh, mesh.userData.name === selected ? 1 - blend : 0),
        );
        meshes.forEach((mesh) => opacity(mesh, blend));
        unfold(rebuild);
        if (elapsed >= 1300) {
          clearMeshes(outgoing);
          outgoing = [];
          pending = null;
          selected = "";
          hovered = "";
          meshes.forEach((mesh) => {
            mesh.geometry.computeBoundingSphere();
            mesh.geometry.computeBoundingBox();
          });
        }
      }
      renderer.render(scene, camera);
      requestRender();
      return;
    }
    for (const mesh of meshes) {
      const active = mesh.userData.name === selected;
      const distance = active ? 0.18 : 0.025;
      const target = [
        Math.cos(mesh.userData.angle) * distance,
        Math.sin(mesh.userData.angle) * distance,
        active ? 0.18 : mesh.userData.name === hovered ? 0.08 : 0,
      ];
      const positions = ["x", "y", "z"] as const;
      positions.forEach((axis, index) => {
        const gap = target[index] - mesh.position[axis];
        mesh.position[axis] += Math.abs(gap) < 0.001 ? gap : gap * easing;
        moving ||= Math.abs(gap) > 0.001;
      });
    }
    renderer.render(scene, camera);
    if (moving) requestRender();
  }
  function requestRender() {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(render);
  }
  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const halfWidth = Math.max(2.5, (2.1 * width) / height);
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = (halfWidth * height) / width;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    requestRender();
  }
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  function hit(event: PointerEvent) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(meshes)[0]?.object.userData.name as
      string | undefined;
  }
  function move(event: PointerEvent) {
    if (pending) return;
    const name = hit(event) || "";
    if (name === hovered) return;
    hovered = name;
    onHover(name);
    renderer.domElement.style.cursor = name ? "pointer" : "default";
    requestRender();
  }
  function leave() {
    hovered = "";
    onHover("");
    requestRender();
  }
  function click(event: PointerEvent) {
    if (pending) return;
    const name = hit(event);
    if (name) onSelect(name);
  }
  function visibility() {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else requestRender();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) requestRender();
    else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  observer.observe(host);
  renderer.domElement.addEventListener("pointermove", move);
  renderer.domElement.addEventListener("pointerleave", leave);
  renderer.domElement.addEventListener("pointerup", click);
  document.addEventListener("visibilitychange", visibility);
  resize();
  return {
    update(items: PieSlice[], focus = "") {
      if (outgoing.length) {
        clearMeshes(outgoing);
        outgoing = [];
      }
      const source = meshes.find((mesh) => mesh.userData.name === focus);
      origin = source
        ? {
            start: source.userData.start,
            sweep: source.userData.sweep,
            angle: source.userData.angle,
          }
        : { start: Math.PI / 2, sweep: Math.PI * 2, angle: 0 };
      pending = items;
      selected = focus;
      transitionStart = performance.now();
      onHover("");
      requestRender();
    },
    select(name: string) {
      selected = name;
      requestRender();
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerleave", leave);
      renderer.domElement.removeEventListener("pointerup", click);
      clearMeshes();
      clearMeshes(outgoing);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
