'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Box, Flex, Heading, Text, Container, SimpleGrid, Button,
  VStack, HStack, Icon, Divider, Tag, TagLabel,
  useBreakpointValue, Avatar, Stack, IconButton, Slider, SliderTrack,
  SliderFilledTrack, SliderThumb, FormControl, FormLabel, Collapse,
  Switch, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, AspectRatio, Image
} from '@chakra-ui/react';
import { useTheme } from '@chakra-ui/react';
import { FaChevronDown, FaRocket, FaLightbulb, FaChartLine, FaCode, FaMobileAlt, FaServer, FaGlobeAfrica, FaConnectdevelop, FaTimes, FaCog, FaArrowRight, FaPlay, FaExternalLinkAlt } from 'react-icons/fa';
import { FiGithub, FiLinkedin, FiTwitter } from 'react-icons/fi';

const MotionBox = motion(Box);

const HomePageClient = () => {

  return (
    <Box
      position="relative"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      overflowX="hidden"
      bg="#151515"
      minH="100vh"
    >
      Ludo

    </Box>
  );
};

export default HomePageClient;
