using UnityEngine;
using Pvr_UnitySDKAPI;
using LegacyVR.KartRacing.Networking;

namespace LegacyVR.KartRacing.CameraSystem
{
    /// <summary>
    /// Decouples the persistent 3DoF Pvr_UnitySDK camera rig from a dynamic kart or future game avatar.
    /// Supports VehicleHorizonLocked, StationarySeated, and Free3DoFFollow modes.
    /// The rig is NEVER parented to the kart/avatar: it is an unparented DontDestroyOnLoad root that is
    /// moved in LateUpdate, so kart pitch/roll never reaches the player's inner ear.
    /// </summary>
    [DefaultExecutionOrder(500)]
    public class Pico3DoFKartCameraRig : MonoBehaviour
    {
        public static Pico3DoFKartCameraRig Instance { get; private set; }

        [Header("PicoVR SDK References")]
        [Tooltip("Root transform of the Pvr_UnitySDK prefab (parent of Head).")]
        [SerializeField] private Transform pvrSdkRootTransform;

        [Tooltip("The 'Head' child transform inside Pvr_UnitySDK driven by Pvr_UnitySDKSensor.")]
        [SerializeField] private Transform pvrHeadTransform;

        [Header("Dynamic Avatar / Kart Binding")]
        [SerializeField] private CameraRigTrackingMode trackingMode = CameraRigTrackingMode.VehicleHorizonLocked;
        [SerializeField] private Transform targetAvatarTransform;
        [SerializeField] private Vector3 cockpitSeatLocalOffset = new Vector3(0f, 0.85f, 0.1f);

        [Header("3DoF Comfort & Horizon Stabilization")]
        [Range(5f, 40f)]
        [SerializeField] private float yawFollowSharpness = 22f;

        [Range(0f, 0.25f)]
        [SerializeField] private float pitchTransferRatio = 0.0f;

        private float _calibratedHmdLocalYawOffset;
        private float _smoothedTargetYaw;
        private float _smoothedTargetPitch;
        private bool _hasTargetAvatar;

        public CameraRigTrackingMode TrackingMode => trackingMode;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;

            // Hierarchy decoupling: the rig must stay a scene root so DontDestroyOnLoad is legal
            // and the kart's transform can never be an ancestor.
            if (transform.parent != null)
            {
                Debug.LogWarning("[Pico3DoFKartCameraRig] Rig must be an unparented root object. Detaching from parent.");
                transform.SetParent(null, true);
            }

            DontDestroyOnLoad(gameObject);

            if (pvrSdkRootTransform == null)
            {
                pvrSdkRootTransform = transform;
            }
        }

        private void OnDestroy()
        {
            if (Instance == this)
            {
                Instance = null;
            }
        }

        public void SetTrackingMode(CameraRigTrackingMode mode)
        {
            trackingMode = mode;
        }

        private void Update()
        {
            if (Controller.UPvr_GetKeyLongPressed(0, Pvr_KeyCode.HOME) ||
                Controller.UPvr_GetKeyLongPressed(0, Pvr_KeyCode.APP) ||
                Input.GetKeyDown(KeyCode.R))
            {
                RecenterView();
            }
        }

        private void LateUpdate()
        {
            if (!_hasTargetAvatar || targetAvatarTransform == null)
                return;

            Vector3 targetForward = targetAvatarTransform.forward;
            Vector3 horizontalForward = new Vector3(targetForward.x, 0f, targetForward.z);

            float targetYaw = _smoothedTargetYaw;
            if (horizontalForward.sqrMagnitude > 0.0001f)
            {
                horizontalForward.Normalize();
                targetYaw = Mathf.Atan2(horizontalForward.x, horizontalForward.z) * Mathf.Rad2Deg;
            }

            if (trackingMode == CameraRigTrackingMode.StationarySeated)
            {
                // Position locked to seat anchor; world yaw remains fixed to initial spawn orientation
                Quaternion fixedYawRot = Quaternion.Euler(0f, _smoothedTargetYaw, 0f);
                pvrSdkRootTransform.position = targetAvatarTransform.position + (fixedYawRot * cockpitSeatLocalOffset);
                return;
            }

            // VehicleHorizonLocked & Free3DoFFollow modes
            float yawLerpFactor = 1f - Mathf.Exp(-yawFollowSharpness * Time.deltaTime);
            _smoothedTargetYaw = Mathf.LerpAngle(_smoothedTargetYaw, targetYaw, yawLerpFactor);

            float rawPitch = Mathf.Asin(Mathf.Clamp(-targetForward.y, -1f, 1f)) * Mathf.Rad2Deg;
            float effectivePitchRatio = (trackingMode == CameraRigTrackingMode.VehicleHorizonLocked) ? pitchTransferRatio : 0f;
            _smoothedTargetPitch = Mathf.LerpAngle(_smoothedTargetPitch, rawPitch * effectivePitchRatio, yawLerpFactor);

            float combinedRigYaw = Mathf.DeltaAngle(0f, _smoothedTargetYaw - _calibratedHmdLocalYawOffset);
            pvrSdkRootTransform.rotation = Quaternion.Euler(_smoothedTargetPitch, combinedRigYaw, 0f);

            Quaternion horizontalTargetRotation = Quaternion.Euler(0f, targetYaw, 0f);
            pvrSdkRootTransform.position = targetAvatarTransform.position + (horizontalTargetRotation * cockpitSeatLocalOffset);
        }

        /// <summary>
        /// Binds the persistent 3DoF camera rig to the local player's spawned kart or game avatar
        /// and immediately aligns the physical headset gaze with the target's forward vector.
        /// </summary>
        public void BindToLocalKart(Transform avatarTransform, Vector3? customSeatOffset = null)
        {
            targetAvatarTransform = avatarTransform;
            _hasTargetAvatar = avatarTransform != null;

            if (customSeatOffset.HasValue)
            {
                cockpitSeatLocalOffset = customSeatOffset.Value;
            }

            if (_hasTargetAvatar)
            {
                Vector3 fwd = targetAvatarTransform.forward;
                _smoothedTargetYaw = Mathf.Atan2(fwd.x, fwd.z) * Mathf.Rad2Deg;
                _smoothedTargetPitch = 0f;
                RecenterView();
            }
        }

        /// <summary>
        /// Calculates the exact yaw offset between the physical Pico headset IMU orientation
        /// and the virtual kart/avatar's horizontal forward vector.
        /// </summary>
        public void RecenterView()
        {
            if (pvrHeadTransform == null)
                return;

            Vector3 headLocalForward = pvrHeadTransform.localRotation * Vector3.forward;
            Vector3 headHorizontalLocal = new Vector3(headLocalForward.x, 0f, headLocalForward.z);

            if (headHorizontalLocal.sqrMagnitude > 0.0001f)
            {
                headHorizontalLocal.Normalize();
                _calibratedHmdLocalYawOffset = Mathf.Atan2(headHorizontalLocal.x, headHorizontalLocal.z) * Mathf.Rad2Deg;
            }
            else
            {
                _calibratedHmdLocalYawOffset = pvrHeadTransform.localEulerAngles.y;
            }

            if (_hasTargetAvatar && targetAvatarTransform != null)
            {
                Vector3 targetForward = targetAvatarTransform.forward;
                Vector3 targetHorizontal = new Vector3(targetForward.x, 0f, targetForward.z);
                if (targetHorizontal.sqrMagnitude > 0.0001f)
                {
                    targetHorizontal.Normalize();
                    _smoothedTargetYaw = Mathf.Atan2(targetHorizontal.x, targetHorizontal.z) * Mathf.Rad2Deg;
                }

                float alignedRigYaw = Mathf.DeltaAngle(0f, _smoothedTargetYaw - _calibratedHmdLocalYawOffset);
                pvrSdkRootTransform.rotation = Quaternion.Euler(0f, alignedRigYaw, 0f);
            }
            else
            {
                Pvr_UnitySDKAPI.Sensor.UPvr_OptionalResetSensor(0, 1, 0);
                _calibratedHmdLocalYawOffset = 0f;
            }

            // ResetController is an instance method in Pvr_UnitySDK 2.8.12.1 (not static as the blueprint draft assumed).
            Pvr_ControllerManager.Instance.ResetController(0);
        }
    }
}
