using UnityEngine;
using Mirror;
using Pvr_UnitySDKAPI;
using LegacyVR.KartRacing.CameraSystem;

namespace LegacyVR.KartRacing.Kart
{
    /// <summary>
    /// Client-authoritative kinematic kart controller optimized for Pico G1 (Snapdragon 820).
    /// Zero server-side Rigidbody physics. Uses kinematic triggers for kart bumping and track pickups.
    /// Requires NetworkIdentity + NetworkTransformUnreliable (SyncDirection = ClientToServer).
    /// Required tags: "PlayerKart" (on this prefab), "BoostPad" (on boost pad triggers).
    /// </summary>
    [RequireComponent(typeof(NetworkIdentity))]
    [RequireComponent(typeof(BoxCollider))]
    [RequireComponent(typeof(Rigidbody))]
    public class KinematicKartController : NetworkBehaviour
    {
        [Header("Kinematic Driving Parameters")]
        [SerializeField] private float maxForwardSpeed = 18f;
        [SerializeField] private float acceleration = 11f;
        [SerializeField] private float deceleration = 8f;
        [SerializeField] private float maxTurnRateDegPerSec = 85f;
        [SerializeField] private float boostMultiplier = 1.45f;
        [SerializeField] private float boostDuration = 1.5f;

        [Header("Single-Ray Ground Height Following")]
        [SerializeField] private LayerMask trackGroundLayer = ~0;
        [SerializeField] private float groundRayOriginHeight = 0.6f;
        [SerializeField] private float groundRayLength = 2.0f;

        [Header("Kinematic Trigger Bump Repulsion")]
        [SerializeField] private float kartBumpSeparationSpeed = 6.5f;
        [SerializeField] private float kartBumpSpeedPenalty = 0.85f;

        private Rigidbody _kinematicBody;
        private BoxCollider _triggerCollider;
        private float _currentSpeed;
        private float _boostTimer;
        private Vector3 _bumpPushVelocity;

        private void Awake()
        {
            // Hard guarantee that PhysX never runs a dynamic solver for karts on the Snapdragon 820.
            _kinematicBody = GetComponent<Rigidbody>();
            _kinematicBody.isKinematic = true;
            _kinematicBody.useGravity = false;
            _kinematicBody.interpolation = RigidbodyInterpolation.None;
            _kinematicBody.collisionDetectionMode = CollisionDetectionMode.Discrete;

            _triggerCollider = GetComponent<BoxCollider>();
            _triggerCollider.isTrigger = true;
        }

        /// <summary>
        /// Karts are spawned with NetworkServer.Spawn(avatar, conn): they are owned objects, NOT the connection's
        /// player object, so Mirror raises OnStartAuthority (not OnStartLocalPlayer) on the owning headset.
        /// </summary>
        public override void OnStartAuthority()
        {
            base.OnStartAuthority();

            if (Pico3DoFKartCameraRig.Instance != null)
            {
                Pico3DoFKartCameraRig.Instance.BindToLocalKart(transform);
            }
        }

        public override void OnStopAuthority()
        {
            base.OnStopAuthority();

            if (Pico3DoFKartCameraRig.Instance != null)
            {
                Pico3DoFKartCameraRig.Instance.BindToLocalKart(null);
            }
        }

        private void Update()
        {
            if (!isOwned)
                return;

            SimulateLocalKinematicKart(Time.deltaTime);
        }

        private void SimulateLocalKinematicKart(float dt)
        {
            float steerInput = ReadPicoSteerInput();
            bool throttleHeld = ReadPicoThrottleInput();

            float activeMaxSpeed = maxForwardSpeed;
            if (_boostTimer > 0f)
            {
                _boostTimer -= dt;
                activeMaxSpeed *= boostMultiplier;
            }

            if (throttleHeld)
            {
                _currentSpeed = Mathf.MoveTowards(_currentSpeed, activeMaxSpeed, acceleration * dt);
            }
            else
            {
                _currentSpeed = Mathf.MoveTowards(_currentSpeed, 0f, deceleration * dt);
            }

            if (Mathf.Abs(_currentSpeed) > 0.1f)
            {
                float speedFactor = Mathf.Clamp01(Mathf.Abs(_currentSpeed) / 4f);
                float yawDelta = steerInput * maxTurnRateDegPerSec * speedFactor * dt;
                transform.Rotate(0f, yawDelta, 0f, Space.Self);
            }

            _bumpPushVelocity = Vector3.MoveTowards(_bumpPushVelocity, Vector3.zero, 18f * dt);

            Vector3 displacement = (transform.forward * _currentSpeed + _bumpPushVelocity) * dt;
            Vector3 nextPos = transform.position + displacement;

            Vector3 rayStart = nextPos + Vector3.up * groundRayOriginHeight;
            if (Physics.Raycast(rayStart, Vector3.down, out RaycastHit hit, groundRayLength, trackGroundLayer, QueryTriggerInteraction.Ignore))
            {
                nextPos.y = hit.point.y;
            }

            transform.position = nextPos;
        }

        private float ReadPicoSteerInput()
        {
            if (Controller.UPvr_GetControllerState(0) == ControllerState.Connected)
            {
                Vector2 axis2D = Controller.UPvr_GetAxis2D(0);
                if (Mathf.Abs(axis2D.x) > 0.08f)
                {
                    return Mathf.Clamp(axis2D.x, -1f, 1f);
                }

                Quaternion controllerRot = Controller.UPvr_GetControllerQUA(0);
                Vector3 controllerRight = controllerRot * Vector3.right;
                return Mathf.Clamp(-controllerRight.y * 2.2f, -1f, 1f);
            }

            return Input.GetAxisRaw("Horizontal");
        }

        private bool ReadPicoThrottleInput()
        {
            if (Controller.UPvr_GetControllerState(0) == ControllerState.Connected)
            {
                return Controller.UPvr_GetKey(0, Pvr_KeyCode.TRIGGER) ||
                       Controller.UPvr_GetKey(0, Pvr_KeyCode.TOUCHPAD);
            }

            return Input.GetKey(KeyCode.JoystickButton0) || Input.GetKey(KeyCode.Space);
        }

        private void OnTriggerEnter(Collider other)
        {
            if (!isOwned)
                return;

            if (other.CompareTag("BoostPad"))
            {
                _boostTimer = boostDuration;
                _currentSpeed = maxForwardSpeed * boostMultiplier;
            }
        }

        private void OnTriggerStay(Collider other)
        {
            if (!isOwned)
                return;

            if (other.CompareTag("PlayerKart") && other.transform != transform)
            {
                Vector3 separation = transform.position - other.transform.position;
                separation.y = 0f;

                float sqrDist = separation.sqrMagnitude;
                if (sqrDist < 0.0001f)
                {
                    separation = transform.right;
                }
                else
                {
                    separation.Normalize();
                }

                _bumpPushVelocity = separation * kartBumpSeparationSpeed;
                _currentSpeed *= kartBumpSpeedPenalty;
            }
        }
    }
}
